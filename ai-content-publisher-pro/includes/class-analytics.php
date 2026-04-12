// includes/class-analytics.php
<?php
if (!defined('ABSPATH')) {
    exit;
}

class ACP_Analytics {
    
    public static function logAction($post_id, $external_content_id, $action_type, $status, $execution_time = 0, $error_details = null) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_analytics';
        
        $wpdb->insert(
            $table,
            array(
                'post_id' => $post_id,
                'external_content_id' => $external_content_id,
                'action_type' => $action_type,
                'status' => $status,
                'execution_time' => $execution_time,
                'error_details' => $error_details
            ),
            array('%d', '%s', '%s', '%s', '%f', '%s')
        );
    }
    
    public static function getPublishingStats($days = 30) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_analytics';
        $date_limit = date('Y-m-d H:i:s', strtotime("-$days days"));
        
        $stats = $wpdb->get_row($wpdb->prepare(
            "SELECT 
                COUNT(*) as total_attempts,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_publishes,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_publishes,
                AVG(execution_time) as avg_execution_time
             FROM $table 
             WHERE created_at >= %s",
            $date_limit
        ));
        
        return $stats;
    }
    
    public static function getRecentActivity($limit = 50) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_analytics';
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table 
             ORDER BY created_at DESC 
             LIMIT %d",
            $limit
        ));
    }
}
