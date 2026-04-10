DELETE FROM "system_settings"
WHERE "key" IN (
  'telegram_bot_token',
  'telegram_chat_id',
  'telegram_quota_threshold',
  'telegram_alerts_enabled',
  'telegram_last_alert_time',
  'telegram_alert_providers',
  'telegram_check_interval',
  'telegram_cooldown'
);
