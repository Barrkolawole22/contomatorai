<?php
/**
 * Plugin Name: AI Content Publisher Pro
 * Plugin URI: https://Botquill.com/ai-content-publisher-plugin
 * Description: Advanced WordPress plugin for AI-powered content publishing with scheduling, bulk operations, and analytics
 * Version: 1.0.0
 * Author: Contomator
 * License: GPL v2 or later
 * Text Domain: ai-content-publisher
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('ACP_PLUGIN_URL', plugin_dir_url(__FILE__));
define('ACP_PLUGIN_PATH', plugin_dir_path(__FILE__));
define('ACP_VERSION', '1.0.0');

/**
 * Main Plugin Class
 */
class AIContentPublisher {
    
    private static $instance = null;
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Hook into WordPress - use plugins_loaded to ensure WordPress is fully loaded
        add_action('plugins_loaded', array($this, 'init'));
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }
    
    public function init() {
        // Check if all required files exist before loading
        if (!$this->checkRequiredFiles()) {
            add_action('admin_notices', array($this, 'showMissingFilesError'));
            return;
        }
        
        // Load text domain for translations
        load_plugin_textdomain('ai-content-publisher', false, dirname(plugin_basename(__FILE__)) . '/languages/');
        
        // Initialize components
        $this->loadDependencies();
        $this->initHooks();
        $this->initScheduler();
        $this->initAPI();
    }
    
    private function checkRequiredFiles() {
        $required_files = array(
            'includes/class-scheduler.php',
            'includes/class-bulk-publisher.php',
            'includes/class-analytics.php',
            'includes/class-api-handler.php',
            'includes/class-admin.php'
        );
        
        foreach ($required_files as $file) {
            if (!file_exists(ACP_PLUGIN_PATH . $file)) {
                return false;
            }
        }
        
        return true;
    }
    
    public function showMissingFilesError() {
        echo '<div class="notice notice-error"><p><strong>AI Content Publisher Pro:</strong> Required plugin files are missing. Please check your installation.</p></div>';
    }
    
    private function loadDependencies() {
        require_once ACP_PLUGIN_PATH . 'includes/class-scheduler.php';
        require_once ACP_PLUGIN_PATH . 'includes/class-bulk-publisher.php';
        require_once ACP_PLUGIN_PATH . 'includes/class-analytics.php';
        require_once ACP_PLUGIN_PATH . 'includes/class-api-handler.php';
        require_once ACP_PLUGIN_PATH . 'includes/class-admin.php';
    }
    
    private function initHooks() {
        add_action('wp_enqueue_scripts', array($this, 'enqueueScripts'));
        add_action('admin_enqueue_scripts', array($this, 'enqueueAdminScripts'));
        add_action('rest_api_init', array($this, 'registerAPIRoutes'));
        
        // Add AJAX handlers
        add_action('wp_ajax_acp_test_webhook', array($this, 'ajaxTestWebhook'));
        add_action('wp_ajax_acp_manual_cleanup', array($this, 'ajaxManualCleanup'));
        
        // Add REST API routes for dashboard
        add_action('rest_api_init', array($this, 'registerDashboardRoutes'));
        
        // Add custom cron schedule
        add_filter('cron_schedules', array($this, 'addCustomCronSchedules'));
    }
    
    private function initScheduler() {
        if (class_exists('ACP_Scheduler')) {
            ACP_Scheduler::getInstance();
        }
    }
    
    private function initAPI() {
        if (class_exists('ACP_API_Handler')) {
            ACP_API_Handler::getInstance();
        }
    }
    
    public function addCustomCronSchedules($schedules) {
        $schedules['every_minute'] = array(
            'interval' => 60,
            'display' => __('Every Minute', 'ai-content-publisher')
        );
        return $schedules;
    }
    
    public function enqueueScripts() {
        // Only enqueue if frontend files exist
        if (file_exists(ACP_PLUGIN_PATH . 'assets/js/frontend.js')) {
            wp_enqueue_script('acp-frontend', ACP_PLUGIN_URL . 'assets/js/frontend.js', array('jquery'), ACP_VERSION, true);
        }
        if (file_exists(ACP_PLUGIN_PATH . 'assets/css/frontend.css')) {
            wp_enqueue_style('acp-frontend', ACP_PLUGIN_URL . 'assets/css/frontend.css', array(), ACP_VERSION);
        }
    }
    
    public function enqueueAdminScripts($hook) {
        if (strpos($hook, 'ai-content-publisher') !== false) {
            if (file_exists(ACP_PLUGIN_PATH . 'assets/js/admin.js')) {
                wp_enqueue_script('acp-admin', ACP_PLUGIN_URL . 'assets/js/admin.js', array('jquery', 'wp-util'), ACP_VERSION, true);
                
                wp_localize_script('acp-admin', 'acpAjax', array(
                    'ajaxurl' => admin_url('admin-ajax.php'),
                    'nonce' => wp_create_nonce('acp_nonce'),
                    'restUrl' => rest_url('ai-content-publisher/v1/')
                ));
            }
            
            if (file_exists(ACP_PLUGIN_PATH . 'assets/css/admin.css')) {
                wp_enqueue_style('acp-admin', ACP_PLUGIN_URL . 'assets/css/admin.css', array(), ACP_VERSION);
            }
        }
    }
    
    public function registerAPIRoutes() {
        if (class_exists('ACP_API_Handler')) {
            ACP_API_Handler::registerRoutes();
        }
    }
    
    public function activate() {
        try {
            $this->createTables();
            $this->scheduleEvents();
            flush_rewrite_rules();
        } catch (Exception $e) {
            // Log error but don't fail activation
            error_log('ACP Activation Error: ' . $e->getMessage());
        }
    }
    
    public function deactivate() {
        $this->clearScheduledEvents();
        flush_rewrite_rules();
    }
    
    private function createTables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Scheduled posts table
        $table_scheduled = $wpdb->prefix . 'acp_scheduled_posts';
        $sql_scheduled = "CREATE TABLE $table_scheduled (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            external_content_id varchar(255) NOT NULL,
            post_data longtext NOT NULL,
            scheduled_date datetime NOT NULL,
            status varchar(20) DEFAULT 'pending',
            retry_count int(3) DEFAULT 0,
            error_message text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY scheduled_date (scheduled_date),
            KEY status (status)
        ) $charset_collate;";
        
        // Analytics table
        $table_analytics = $wpdb->prefix . 'acp_analytics';
        $sql_analytics = "CREATE TABLE $table_analytics (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            post_id bigint(20),
            external_content_id varchar(255),
            action_type varchar(50) NOT NULL,
            status varchar(20) NOT NULL,
            execution_time float,
            error_details text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY action_type (action_type),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        // Bulk operations table
        $table_bulk = $wpdb->prefix . 'acp_bulk_operations';
        $sql_bulk = "CREATE TABLE $table_bulk (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            operation_id varchar(255) NOT NULL,
            total_items int(11) NOT NULL,
            processed_items int(11) DEFAULT 0,
            failed_items int(11) DEFAULT 0,
            status varchar(20) DEFAULT 'pending',
            operation_data longtext,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY operation_id (operation_id)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql_scheduled);
        dbDelta($sql_analytics);
        dbDelta($sql_bulk);
    }
    
    private function scheduleEvents() {
        if (!wp_next_scheduled('acp_process_scheduled_posts')) {
            wp_schedule_event(time(), 'every_minute', 'acp_process_scheduled_posts');
        }
        
        if (!wp_next_scheduled('acp_cleanup_old_data')) {
            wp_schedule_event(time(), 'daily', 'acp_cleanup_old_data');
        }
    }
    
    private function clearScheduledEvents() {
        wp_clear_scheduled_hook('acp_process_scheduled_posts');
        wp_clear_scheduled_hook('acp_cleanup_old_data');
    }
    
    // AJAX Handlers
    public function ajaxTestWebhook() {
        check_ajax_referer('acp_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $webhook_url = get_option('acp_webhook_url', '');
        
        if (empty($webhook_url)) {
            wp_send_json_error('No webhook URL configured');
        }
        
        $test_data = array(
            'test' => true,
            'timestamp' => current_time('mysql'),
            'site_url' => get_site_url()
        );
        
        $response = wp_remote_post($webhook_url, array(
            'body' => json_encode($test_data),
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-API-Key' => get_option('acp_api_key', '')
            ),
            'timeout' => 15
        ));
        
        if (is_wp_error($response)) {
            wp_send_json_error($response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code >= 200 && $status_code < 300) {
            wp_send_json_success();
        } else {
            wp_send_json_error('HTTP ' . $status_code);
        }
    }
    
    public function ajaxManualCleanup() {
        check_ajax_referer('acp_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        global $wpdb;
        
        $tables = array(
            $wpdb->prefix . 'acp_scheduled_posts',
            $wpdb->prefix . 'acp_analytics'
        );
        
        $cleanup_days = get_option('acp_cleanup_days', 30);
        $cleanup_date = date('Y-m-d H:i:s', strtotime("-$cleanup_days days"));
        
        $total_deleted = 0;
        
        foreach ($tables as $table) {
            $deleted = $wpdb->query($wpdb->prepare(
                "DELETE FROM $table WHERE created_at < %s AND status IN ('completed', 'failed')",
                $cleanup_date
            ));
            
            if ($deleted !== false) {
                $total_deleted += $deleted;
            }
        }
        
        wp_send_json_success(array('records_deleted' => $total_deleted));
    }
    
    // REST API endpoints for dashboard
    public function registerDashboardRoutes() {
        register_rest_route('ai-content-publisher/v1', '/dashboard-stats', array(
            'methods' => 'GET',
            'callback' => array($this, 'getDashboardStats'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));
        
        register_rest_route('ai-content-publisher/v1', '/cancel-schedule/(?P<id>\d+)', array(
            'methods' => 'POST',
            'callback' => array($this, 'cancelScheduledPost'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));
        
        register_rest_route('ai-content-publisher/v1', '/export/(?P<format>csv|json)', array(
            'methods' => 'GET',
            'callback' => array($this, 'exportData'),
            'permission_callback' => function() {
                return current_user_can('manage_options');
            }
        ));
    }
    
    public function getDashboardStats($request) {
        global $wpdb;
        
        $scheduled_table = $wpdb->prefix . 'acp_scheduled_posts';
        $analytics_table = $wpdb->prefix . 'acp_analytics';
        
        $today = date('Y-m-d');
        
        $pending_count = $wpdb->get_var(
            "SELECT COUNT(*) FROM $scheduled_table WHERE status = 'pending'"
        );
        
        $published_today = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $analytics_table 
             WHERE action_type = 'scheduled_publish' 
             AND status = 'success' 
             AND DATE(created_at) = %s",
            $today
        ));
        
        $failed_today = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $analytics_table 
             WHERE action_type = 'scheduled_publish' 
             AND status = 'failed' 
             AND DATE(created_at) = %s",
            $today
        ));
        
        $last_processed = $wpdb->get_var(
            "SELECT MAX(updated_at) FROM $scheduled_table WHERE status = 'completed'"
        );
        
        $cron_running = wp_next_scheduled('acp_process_scheduled_posts') !== false;
        
        return array(
            'pending_count' => intval($pending_count),
            'published_today' => intval($published_today),
            'failed_today' => intval($failed_today),
            'last_processed' => $last_processed ? date('M j, H:i', strtotime($last_processed)) : null,
            'cron_running' => $cron_running,
            'api_accessible' => true
        );
    }
    
    public function cancelScheduledPost($request) {
        global $wpdb;
        
        $schedule_id = intval($request['id']);
        $table = $wpdb->prefix . 'acp_scheduled_posts';
        
        $result = $wpdb->update(
            $table,
            array('status' => 'cancelled'),
            array('id' => $schedule_id, 'status' => 'pending'),
            array('%s'),
            array('%d', '%s')
        );
        
        if ($result === false) {
            return new WP_Error('db_error', 'Failed to cancel scheduled post');
        }
        
        if ($result === 0) {
            return new WP_Error('not_found', 'Scheduled post not found or already processed');
        }
        
        return array('success' => true, 'message' => 'Scheduled post cancelled');
    }
    
    public function exportData($request) {
        global $wpdb;
        
        $format = $request['format'];
        $analytics_table = $wpdb->prefix . 'acp_analytics';
        
        $data = $wpdb->get_results(
            "SELECT * FROM $analytics_table ORDER BY created_at DESC LIMIT 1000",
            ARRAY_A
        );
        
        if ($format === 'csv') {
            header('Content-Type: text/csv');
            header('Content-Disposition: attachment; filename="acp-analytics-' . date('Y-m-d') . '.csv"');
            
            $output = fopen('php://output', 'w');
            
            if (!empty($data)) {
                fputcsv($output, array_keys($data[0]));
                foreach ($data as $row) {
                    fputcsv($output, $row);
                }
            }
            
            fclose($output);
            exit;
        } else {
            header('Content-Type: application/json');
            header('Content-Disposition: attachment; filename="acp-analytics-' . date('Y-m-d') . '.json"');
            
            echo json_encode($data, JSON_PRETTY_PRINT);
            exit;
        }
    }
}

// Initialize the plugin
AIContentPublisher::getInstance();

// Initialize admin if in admin area
if (is_admin() && class_exists('ACP_Admin')) {
    new ACP_Admin();
}
?>