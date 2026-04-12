// includes/class-admin.php
<?php
if (!defined('ABSPATH')) {
    exit;
}

class ACP_Admin {
    
    public function __construct() {
        add_action('admin_menu', array($this, 'addAdminMenu'));
        add_action('admin_init', array($this, 'initSettings'));
    }
    
    public function addAdminMenu() {
        add_menu_page(
            'AI Content Publisher',
            'AI Content Publisher',
            'manage_options',
            'ai-content-publisher',
            array($this, 'adminPage'),
            'dashicons-schedule',
            30
        );
        
        add_submenu_page(
            'ai-content-publisher',
            'Settings',
            'Settings',
            'manage_options',
            'ai-content-publisher-settings',
            array($this, 'settingsPage')
        );
        
        add_submenu_page(
            'ai-content-publisher',
            'Analytics',
            'Analytics',
            'manage_options',
            'ai-content-publisher-analytics',
            array($this, 'analyticsPage')
        );
    }
    
    public function initSettings() {
        register_setting('acp_settings', 'acp_api_key');
        register_setting('acp_settings', 'acp_webhook_url');
        register_setting('acp_settings', 'acp_max_retries');
        register_setting('acp_settings', 'acp_cleanup_days');
    }
    
    public function adminPage() {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_scheduled_posts';
        $scheduled_posts = $wpdb->get_results(
            "SELECT * FROM $table 
             WHERE status IN ('pending', 'processing') 
             ORDER BY scheduled_date ASC 
             LIMIT 20"
        );
        
        include ACP_PLUGIN_PATH . 'admin/main-page.php';
    }
    
    public function settingsPage() {
        include ACP_PLUGIN_PATH . 'admin/settings-page.php';
    }
    
    public function analyticsPage() {
        $stats = ACP_Analytics::getPublishingStats(30);
        $recent_activity = ACP_Analytics::getRecentActivity(50);
        
        include ACP_PLUGIN_PATH . 'admin/analytics-page.php';
    }
}
?>