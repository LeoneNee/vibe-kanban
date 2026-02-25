use axum::{extract::Request, middleware::Next, response::Response};

pub async fn add_security_headers(req: Request, next: Next) -> Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.insert("x-content-type-options", "nosniff".parse().unwrap());
    headers.insert("x-frame-options", "DENY".parse().unwrap());
    headers.insert(
        "referrer-policy",
        "strict-origin-when-cross-origin".parse().unwrap(),
    );
    headers.insert(
        "content-security-policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:"
            .parse()
            .unwrap(),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, routing::get, Router};
    use tower::ServiceExt;

    async fn test_handler() -> &'static str {
        "ok"
    }

    #[tokio::test]
    async fn response_includes_security_headers() {
        let app = Router::new()
            .route("/test", get(test_handler))
            .layer(axum::middleware::from_fn(add_security_headers));

        let response: axum::response::Response = app
            .oneshot(Request::builder().uri("/test").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(
            response.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );
        assert_eq!(
            response.headers().get("x-frame-options").unwrap(),
            "DENY"
        );
        assert_eq!(
            response.headers().get("referrer-policy").unwrap(),
            "strict-origin-when-cross-origin"
        );
        assert!(response
            .headers()
            .get("content-security-policy")
            .is_some());
    }
}
