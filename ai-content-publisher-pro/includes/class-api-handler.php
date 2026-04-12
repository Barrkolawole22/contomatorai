<?php
// includes/class-api-handler.php
if (!defined('ABSPATH')) {
    exit;
}

class ACP_API_Handler {
    
    private static $instance = null;
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public static function registerRoutes() {
        $auth_instance = class_exists('ACP_Authentication') ? ACP_Authentication::getInstance() : null;
        
        // Test connection endpoint
        register_rest_route('ai-content-publisher/v1', '/test-connection', array(
            'methods' => 'POST',
            'callback' => array(self::getInstance(), 'testConnection'),
            'permission_callback' => $auth_instance ? 
                array($auth_instance, 'checkPermissions') : 
                array(self::getInstance(), 'checkPermissions')
        ));
        
        // Schedule single post
        register_rest_route('ai-content-publisher/v1', '/schedule', array(
            'methods' => 'POST',
            'callback' => array(self::getInstance(), 'schedulePost'),
            'permission_callback' => $auth_instance ? 
                array($auth_instance, 'checkPermissions') : 
                array(self::getInstance(), 'checkPermissions')
        ));
        
        // Bulk schedule posts
        register_rest_route('ai-content-publisher/v1', '/bulk-schedule', array(
            'methods' => 'POST',
            'callback' => array(self::getInstance(), 'bulkSchedule'),
            'permission_callback' => $auth_instance ? 
                array($auth_instance, 'checkPermissions') : 
                array(self::getInstance(), 'checkPermissions')
        ));
        
        // Publish immediately
        register_rest_route('ai-content-publisher/v1', '/publish', array(
            'methods' => 'POST',
            'callback' => array(self::getInstance(), 'publishNow'),
            'permission_callback' => $auth_instance ? 
                array($auth_instance, 'checkPermissions') : 
                array(self::getInstance(), 'checkPermissions')
        ));
        
        // Get operation status
        register_rest_route('ai-content-publisher/v1', '/status/(?P<operation_id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'GET',
            'callback' => array(self::getInstance(), 'getOperationStatus'),
            'permission_callback' => $auth_instance ? 
                array($auth_instance, 'checkPermissions') : 
                array(self::getInstance(), 'checkPermissions')
        ));
        
        // Get analytics
        register_rest_route('ai-content-publisher/v1', '/analytics', array(
            'methods' => 'GET',
            'callback' => array(self::getInstance(), 'getAnalytics'),
            'permission_callback' => $auth_instance ? 
                array($auth_instance, 'checkPermissions') : 
                array(self::getInstance(), 'checkPermissions')
        ));
    }
    
    /**
     * Test connection endpoint
     * Returns plugin status and WordPress environment info
     */
    public function testConnection($request) {
        try {
            // Get current user info
            $current_user = wp_get_current_user();
            
            // If no user is logged in but we passed auth (API key), get admin info
            if (!$current_user->ID) {
                $admin_users = get_users(array(
                    'role' => 'administrator', 
                    'number' => 1,
                    'fields' => array('ID', 'display_name')
                ));
                $current_user = !empty($admin_users) ? $admin_users[0] : null;
            }
            
            // Get plugin version
            $plugin_version = defined('ACP_VERSION') ? ACP_VERSION : 'Unknown';
            
            // Get WordPress info
            $wp_info = array(
                'version' => get_bloginfo('version'),
                'site_url' => get_site_url(),
                'site_name' => get_bloginfo('name'),
                'timezone' => wp_timezone_string(),
                'admin_email' => get_option('admin_email'),
                'plugin_version' => $plugin_version
            );
            
            // Check if required classes are available
            $components_status = array(
                'scheduler' => class_exists('ACP_Scheduler'),
                'bulk_publisher' => class_exists('ACP_BulkPublisher'),
                'analytics' => class_exists('ACP_Analytics'),
                'authentication' => class_exists('ACP_Authentication')
            );
            
            $response_data = array(
                'success' => true,
                'message' => 'AI Content Publisher Pro connection successful',
                'timestamp' => current_time('mysql'),
                'user' => array(
                    'id' => $current_user ? $current_user->ID : 1,
                    'name' => $current_user ? $current_user->display_name : 'System',
                    'roles' => $current_user ? $current_user->roles : array('administrator')
                ),
                'wordpress_info' => $wp_info,
                'components_status' => $components_status,
                'api_endpoints' => array(
                    'test_connection' => rest_url('ai-content-publisher/v1/test-connection'),
                    'schedule' => rest_url('ai-content-publisher/v1/schedule'),
                    'bulk_schedule' => rest_url('ai-content-publisher/v1/bulk-schedule'),
                    'publish' => rest_url('ai-content-publisher/v1/publish'),
                    'analytics' => rest_url('ai-content-publisher/v1/analytics')
                )
            );
            
            return new WP_REST_Response($response_data, 200);
            
        } catch (Exception $e) {
            error_log('ACP Test Connection Error: ' . $e->getMessage());
            return new WP_Error('connection_failed', $e->getMessage(), array('status' => 500));
        }
    }
    
    /**
     * Fallback permission check if ACP_Authentication class is not available
     */
    public function checkPermissions($request) {
        // Check for API key in header first
        $api_key = $request->get_header('X-API-Key');
        $stored_key = get_option('acp_api_key', '');
        
        // If API key is provided, validate it
        if (!empty($api_key)) {
            if (empty($stored_key)) {
                // Generate a default API key if none exists
                $stored_key = wp_generate_password(32, false);
                update_option('acp_api_key', $stored_key);
                
                // Log the new API key for admin reference
                error_log('ACP: Generated new API key. Please check your plugin settings.');
            }
            
            if (hash_equals($stored_key, $api_key)) {
                return true;
            } else {
                return new WP_Error('unauthorized', 'Invalid API key', array('status' => 401));
            }
        }
        
        // Fallback to WordPress user authentication
        if (!is_user_logged_in()) {
            return new WP_Error('unauthorized', 'Authentication required', array('status' => 401));
        }
        
        // Check if user has permission to edit posts
        if (!current_user_can('edit_posts')) {
            return new WP_Error('forbidden', 'Insufficient permissions', array('status' => 403));
        }
        
        return true;
    }
    
    // Schedule a single post
    public function schedulePost($request) {
        $params = $request->get_json_params();
        
        if (empty($params['content_data']) || empty($params['publish_date'])) {
            return new WP_Error('invalid_params', 'Missing required parameters: content_data and publish_date', array('status' => 400));
        }
        
        // Check if scheduler class exists
        if (!class_exists('ACP_Scheduler')) {
            return new WP_Error('scheduler_unavailable', 'Scheduler component not available', array('status' => 500));
        }
        
        try {
            $scheduler = ACP_Scheduler::getInstance();
            $schedule_id = $scheduler->schedulePost($params['content_data'], $params['publish_date']);
            
            if ($schedule_id) {
                return new WP_REST_Response(array(
                    'success' => true,
                    'schedule_id' => $schedule_id,
                    'publish_date' => $params['publish_date'],
                    'message' => 'Post scheduled successfully'
                ), 200);
            } else {
                return new WP_Error('schedule_failed', 'Failed to schedule post', array('status' => 500));
            }
        } catch (Exception $e) {
            return new WP_Error('schedule_error', $e->getMessage(), array('status' => 500));
        }
    }
    
    // Bulk schedule posts
    public function bulkSchedule($request) {
        $params = $request->get_json_params();
        
        if (empty($params['content_items']) || !is_array($params['content_items'])) {
            return new WP_Error('invalid_params', 'Missing or invalid content_items array', array('status' => 400));
        }
        
        // Check if bulk publisher class exists
        if (!class_exists('ACP_BulkPublisher')) {
            return new WP_Error('bulk_publisher_unavailable', 'Bulk publisher component not available', array('status' => 500));
        }
        
        try {
            $options = $params['options'] ?? array();
            $operation_id = ACP_BulkPublisher::scheduleBulkPublish($params['content_items'], $options);
            
            return new WP_REST_Response(array(
                'success' => true,
                'operation_id' => $operation_id,
                'total_items' => count($params['content_items']),
                'message' => 'Bulk operation scheduled successfully'
            ), 200);
        } catch (Exception $e) {
            return new WP_Error('bulk_schedule_error', $e->getMessage(), array('status' => 500));
        }
    }
    
    // Publish post immediately
    public function publishNow($request) {
        $params = $request->get_json_params();
        
        if (empty($params['content_data'])) {
            return new WP_Error('invalid_params', 'Missing content_data', array('status' => 400));
        }
        
        try {
            // Check if scheduler class exists
            if (!class_exists('ACP_Scheduler')) {
                return new WP_Error('scheduler_unavailable', 'Scheduler component not available', array('status' => 500));
            }
            
            $scheduler = ACP_Scheduler::getInstance();
            $post_id = $scheduler->createWordPressPost($params['content_data']);
            
            if ($post_id && !is_wp_error($post_id)) {
                // Log analytics if available
                if (class_exists('ACP_Analytics')) {
                    $external_id = $params['content_data']['external_id'] ?? null;
                    ACP_Analytics::logAction($post_id, $external_id, 'immediate_publish', 'success');
                }
                
                return new WP_REST_Response(array(
                    'success' => true,
                    'post_id' => $post_id,
                    'post_url' => get_permalink($post_id),
                    'edit_url' => get_edit_post_link($post_id),
                    'message' => 'Post published successfully'
                ), 200);
            } else {
                $error_message = is_wp_error($post_id) ? $post_id->get_error_message() : 'Failed to create post';
                throw new Exception($error_message);
            }
        } catch (Exception $e) {
            // Log analytics if available
            if (class_exists('ACP_Analytics')) {
                $external_id = $params['content_data']['external_id'] ?? null;
                ACP_Analytics::logAction(null, $external_id, 'immediate_publish', 'failed', 0, $e->getMessage());
            }
            
            return new WP_Error('publish_failed', $e->getMessage(), array('status' => 500));
        }
    }
    
    // Get bulk operation status
    public function getOperationStatus($request) {
        $operation_id = $request['operation_id'];
        
        if (!class_exists('ACP_BulkPublisher')) {
            return new WP_Error('bulk_publisher_unavailable', 'Bulk publisher component not available', array('status' => 500));
        }
        
        try {
            $status = ACP_BulkPublisher::getBulkOperationStatus($operation_id);
            
            if ($status) {
                return new WP_REST_Response($status, 200);
            } else {
                return new WP_Error('not_found', 'Operation not found', array('status' => 404));
            }
        } catch (Exception $e) {
            return new WP_Error('status_error', $e->getMessage(), array('status' => 500));
        }
    }
    
    // Get analytics data
    public function getAnalytics($request) {
        if (!class_exists('ACP_Analytics')) {
            return new WP_Error('analytics_unavailable', 'Analytics component not available', array('status' => 500));
        }
        
        try {
            $days = intval($request->get_param('days') ?? 30);
            $days = max(1, min(365, $days)); // Limit between 1 and 365 days
            
            $stats = ACP_Analytics::getPublishingStats($days);
            $recent_activity = ACP_Analytics::getRecentActivity(20);
            
            return new WP_REST_Response(array(
                'success' => true,
                'period_days' => $days,
                'stats' => $stats,
                'recent_activity' => $recent_activity,
                'generated_at' => current_time('mysql')
            ), 200);
        } catch (Exception $e) {
            return new WP_Error('analytics_error', $e->getMessage(), array('status' => 500));
        }
    }
}
?>