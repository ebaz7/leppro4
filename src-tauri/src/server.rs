use std::net::SocketAddr;
use std::path::PathBuf;
use axum::{routing::get, Json, Router};
use serde_json::json;

pub async fn start_embedded_server(port: u16, _static_dir: Option<PathBuf>) -> Result<(), String> {
    let app = Router::new()
        .route("/api/health", get(|| async { Json(json!({ "status": "ok", "mode": "embedded" })) }));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tokio::spawn(async move {
        if let Err(e) = axum::Server::bind(&addr).serve(app.into_make_service()).await {
            eprintln!("Embedded server error: {}", e);
        }
    });

    Ok(())
}
