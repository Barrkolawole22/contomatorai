// admin/settings-page.php
?>
<div class="wrap">
    <h1>AI Content Publisher Settings</h1>
    
    <form method="post" action="options.php">
        <?php
        settings_fields('acp_settings');
        do_settings_sections('acp_settings');
        ?>
        
        <table class="form-table">
            <tr>
                <th scope="row">
                    <label for="acp_api_key">API Key</label>
                </th>
                <td>
                    <input type="password" id="acp_api_key" name="acp_api_key" 
                           value="<?php echo esc_attr(get_option('acp_api_key', '')); ?>" 
                           class="regular-text" />
                    <p class="description">
                        API key for authenticating requests from your content generation platform.
                    </p>
                </td>
            </tr>
            
            <tr>
                <th scope="row">
                    <label for="acp_webhook_url">Webhook URL</label>
                </th>
                <td>
                    <input type="url" id="acp_webhook_url" name="acp_webhook_url" 
                           value="<?php echo esc_attr(get_option('acp_webhook_url', '')); ?>" 
                           class="regular-text" />
                    <p class="description">
                        URL to notify your platform about publishing status updates.
                    </p>
                </td>
            </tr>
            
            <tr>
                <th scope="row">
                    <label for="acp_max_retries">Max Retries</label>
                </th>
                <td>
                    <input type="number" id="acp_max_retries" name="acp_max_retries" 
                           value="<?php echo esc_attr(get_option('acp_max_retries', 3)); ?>" 
                           min="1" max="10" class="small-text" />
                    <p class="description">
                        Maximum number of retry attempts for failed publications.
                    </p>
                </td>
            </tr>
            
            <tr>
                <th scope="row">
                    <label for="acp_cleanup_days">Cleanup After (Days)</label>
                </th>
                <td>
                    <input type="number" id="acp_cleanup_days" name="acp_cleanup_days" 
                           value="<?php echo esc_attr(get_option('acp_cleanup_days', 30)); ?>" 
                           min="7" max="365" class="small-text" />
                    <p class="description">
                        Number of days to keep completed/failed records before cleanup.
                    </p>
                </td>
            </tr>
        </table>
        
        <?php submit_button(); ?>
    </form>
    
    <div class="acp-card">
        <h3>Test Connection</h3>
        <p>Test the webhook connection to your content generation platform.</p>
        <button type="button" id="test-webhook" class="button button-secondary">
            Test Webhook
        </button>
        <div id="webhook-test-result" style="margin-top: 10px;"></div>
    </div>
    
    <div class="acp-card">
        <h3>Manual Cleanup</h3>
        <p>Manually clean up old records from the database.</p>
        <button type="button" id="manual-cleanup" class="button button-secondary">
            Run Cleanup Now
        </button>
        <div id="cleanup-result" style="margin-top: 10px;"></div>
    </div>
</div>

<?php