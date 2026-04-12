// includes/class-bulk-publisher.php
<?php
if (!defined('ABSPATH')) {
    exit;
}

class ACP_BulkPublisher {
    
    public static function scheduleBulkPublish($content_items, $options = array()) {
        global $wpdb;
        
        $operation_id = uniqid('bulk_', true);
        $table = $wpdb->prefix . 'acp_bulk_operations';
        
        // Insert bulk operation record
        $wpdb->insert(
            $table,
            array(
                'operation_id' => $operation_id,
                'total_items' => count($content_items),
                'status' => 'pending',
                'operation_data' => json_encode($options)
            ),
            array('%s', '%d', '%s', '%s')
        );
        
        // Schedule individual posts
        $scheduler = ACP_Scheduler::getInstance();
        $base_date = new DateTime($options['start_date'] ?? 'now');
        $interval = intval($options['interval_minutes'] ?? 60);
        
        foreach ($content_items as $index => $content) {
            $publish_date = clone $base_date;
            $publish_date->add(new DateInterval('PT' . ($index * $interval) . 'M'));
            
            $content['bulk_operation_id'] = $operation_id;
            $scheduler->schedulePost($content, $publish_date->format('Y-m-d H:i:s'));
        }
        
        return $operation_id;
    }
    
    public static function getBulkOperationStatus($operation_id) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_bulk_operations';
        
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE operation_id = %s",
            $operation_id
        ));
    }
}
