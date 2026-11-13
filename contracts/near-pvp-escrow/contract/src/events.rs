use near_sdk::{
    env,
    serde_json::{Value, json},
};

pub fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({
            "standard": "near_pvp_escrow", "version": "1.0.0", "event": event, "data": [data]
        })
    ));
}
