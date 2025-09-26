use super::types::*;
use reqwest::Client;
use serde_json::json;

pub struct OpenCodeApiClient {
    client: Client,
    base_url: String,
}

impl OpenCodeApiClient {
    pub fn new(host: &str, port: u16) -> Self {
        Self {
            client: Client::new(),
            base_url: format!("http://{}:{}", host, port),
        }
    }

    pub async fn health(&self) -> Result<bool, String> {
        // OpenCode doesn't have a /health endpoint, use /config instead
        let url = format!("{}/config", self.base_url);
        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(e) => Err(e.to_string()),
        }
    }

    pub async fn send_prompt(&self, prompt: &str) -> Result<ApiResponse<serde_json::Value>, String> {
        // Use the correct OpenCode endpoint for sending prompts
        let url = format!("{}/tui/submit-prompt", self.base_url);
        let body = json!({
            "prompt": prompt
        });

        match self.client.post(&url).json(&body).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<ApiResponse<serde_json::Value>>().await {
                        Ok(data) => Ok(data),
                        Err(e) => Err(format!("Failed to parse response: {}", e)),
                    }
                } else {
                    Err(format!("Request failed with status: {}", response.status()))
                }
            }
            Err(e) => Err(e.to_string()),
        }
    }

    pub async fn get_openapi_spec(&self) -> Result<serde_json::Value, String> {
        let url = format!("{}/doc", self.base_url);
        match self.client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<serde_json::Value>().await {
                        Ok(spec) => Ok(spec),
                        Err(e) => Err(format!("Failed to parse OpenAPI spec: {}", e)),
                    }
                } else {
                    Err(format!("Failed to get OpenAPI spec: {}", response.status()))
                }
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_api_authentication() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/config"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&mock_server)
            .await;

        let client = OpenCodeApiClient::new("127.0.0.1", mock_server.address().port());
        let result = client.health().await;

        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[tokio::test]
    async fn test_send_prompt_to_server() {
        let mock_server = MockServer::start().await;

        let response_body = json!({
            "success": true,
            "data": {
                "message": "Prompt received"
            },
            "error": null
        });

        Mock::given(method("POST"))
            .and(path("/tui/submit-prompt"))
            .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
            .mount(&mock_server)
            .await;

        let client = OpenCodeApiClient::new("127.0.0.1", mock_server.address().port());
        let result = client.send_prompt("Test prompt").await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.success);
        assert!(response.data.is_some());
    }

    #[tokio::test]
    async fn test_handle_connection_error() {
        // Use a port that's guaranteed not to be listening
        let client = OpenCodeApiClient::new("127.0.0.1", 59999);
        let result = client.health().await;

        assert!(result.is_err());
        let error_msg = result.unwrap_err();
        assert!(error_msg.contains("Connection refused") || error_msg.contains("error"));
    }

    #[tokio::test]
    async fn test_get_openapi_spec() {
        let mock_server = MockServer::start().await;

        let spec = json!({
            "openapi": "3.1.0",
            "info": {
                "title": "OpenCode Server API",
                "version": "1.0.0"
            },
            "paths": {}
        });

        Mock::given(method("GET"))
            .and(path("/doc"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&spec))
            .mount(&mock_server)
            .await;

        let client = OpenCodeApiClient::new("127.0.0.1", mock_server.address().port());
        let result = client.get_openapi_spec().await;

        assert!(result.is_ok());
        let received_spec = result.unwrap();
        assert_eq!(received_spec["openapi"], "3.1.0");
        assert_eq!(received_spec["info"]["title"], "OpenCode Server API");
    }
}