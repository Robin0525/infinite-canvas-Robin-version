#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_dialog::DialogExt;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{distributions::Alphanumeric, Rng};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{io::{Read, Write}, net::{TcpListener, TcpStream}, process::Command, thread, time::{Duration, Instant}};

#[tauri::command]
fn save_download(app: tauri::AppHandle, filename: String, bytes: Vec<u8>) -> Result<bool, String> {
    let Some(path) = app.dialog().file().set_file_name(&filename).blocking_save_file() else {
        return Ok(false);
    };
    std::fs::write(path.as_path().ok_or("The selected path is not a local file")?, bytes).map_err(|error| error.to_string())?;
    Ok(true)
}

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: Option<String>,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[tauri::command]
async fn google_oauth_authorize(client_id: String, client_secret: String) -> Result<(String, u64, String), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let state: String = rand::thread_rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
    let verifier: String = rand::thread_rng().sample_iter(&Alphanumeric).take(64).map(char::from).collect();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(client_id.trim()), urlencoding::encode(&redirect_uri), urlencoding::encode("https://www.googleapis.com/auth/drive.readonly"), state, challenge
    );
    open_browser(&auth_url)?;
    let expected_state = state.clone();
    let (code, mut browser_stream) = tauri::async_runtime::spawn_blocking(move || -> Result<(String, TcpStream), String> {
        let started = Instant::now();
        loop {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut request = [0_u8; 8192];
                    let size = stream.read(&mut request).unwrap_or(0);
                    let line = String::from_utf8_lossy(&request[..size]).lines().next().unwrap_or("").to_string();
                    let target = line.split_whitespace().nth(1).unwrap_or("/");
                    let parsed = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|error| error.to_string())?;
                    let params = parsed.query_pairs().collect::<std::collections::HashMap<_, _>>();
                    let result = if params.get("state").map(|value| value.as_ref()) != Some(expected_state.as_str()) {
                        Err("Google 授权状态校验失败，请重试".to_string())
                    } else if let Some(error) = params.get("error") {
                        Err(format!("Google 授权失败：{error}"))
                    } else {
                        params.get("code").map(|value| value.to_string()).ok_or_else(|| "Google 授权没有返回登录凭证".to_string())
                    };
                    return match result {
                        Ok(code) => Ok((code, stream)),
                        Err(error) => {
                            write_oauth_response(&mut stream, false, &error);
                            Err(error)
                        }
                    };
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock && started.elapsed() < Duration::from_secs(120) => thread::sleep(Duration::from_millis(100)),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => return Err("等待 Google 登录超时，请重新连接".to_string()),
                Err(error) => return Err(error.to_string()),
            }
        }
    }).await.map_err(|error| error.to_string())??;
    let token_result = async {
        let response = reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&[
            ("client_id", client_id.trim()), ("client_secret", client_secret.trim()), ("code", code.as_str()), ("code_verifier", verifier.as_str()), ("grant_type", "authorization_code"), ("redirect_uri", redirect_uri.as_str()),
        ]).send().await.map_err(|error| error.to_string())?;
        let token: GoogleTokenResponse = response.json().await.map_err(|error| error.to_string())?;
        let access_token = token.access_token.ok_or_else(|| token.error_description.or(token.error).unwrap_or_else(|| "Google 未返回访问令牌".to_string()))?;
        let refresh_token = token.refresh_token.ok_or_else(|| "Google 未返回刷新令牌，请撤销应用授权后重新连接".to_string())?;
        Ok::<(String, u64, String), String>((access_token, token.expires_in.unwrap_or(3600), refresh_token))
    }.await;
    match token_result {
        Ok(value) => {
            write_oauth_response(&mut browser_stream, true, "授权凭证已成功返回无限画板");
            Ok(value)
        }
        Err(error) => {
            write_oauth_response(&mut browser_stream, false, &error);
            Err(error)
        }
    }
}

#[tauri::command]
async fn google_oauth_refresh(client_id: String, client_secret: String, refresh_token: String) -> Result<(String, u64), String> {
    let response = reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&[
        ("client_id", client_id.trim()),
        ("client_secret", client_secret.trim()),
        ("refresh_token", refresh_token.trim()),
        ("grant_type", "refresh_token"),
    ]).send().await.map_err(|error| error.to_string())?;
    let token: GoogleTokenResponse = response.json().await.map_err(|error| error.to_string())?;
    let access_token = token.access_token.ok_or_else(|| token.error_description.or(token.error).unwrap_or_else(|| "Google 刷新登录状态失败，请重新连接".to_string()))?;
    Ok((access_token, token.expires_in.unwrap_or(3600)))
}

fn write_oauth_response(stream: &mut TcpStream, success: bool, detail: &str) {
    let status = if success { "200 OK" } else { "400 Bad Request" };
    let title = if success { "Google 授权完成" } else { "Google 授权失败" };
    let safe_detail = detail.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let body = format!("<html><body><h3>{title}</h3><p>{safe_detail}</p><p>请关闭此页面并返回无限画板。</p></body></html>");
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.as_bytes().len());
    let _ = stream.write_all(response.as_bytes());
}

#[tauri::command]
fn open_system_browser(url: String) -> Result<(), String> {
    open_browser(&url)
}

fn open_browser(url: &str) -> Result<(), String> {
    Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler", url]).spawn().map_err(|error| error.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![save_download, google_oauth_authorize, google_oauth_refresh, open_system_browser])
        .run(tauri::generate_context!())
        .expect("运行无限画板桌面版时发生错误");
}
