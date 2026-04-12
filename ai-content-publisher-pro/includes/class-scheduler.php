<?php
// includes/class-scheduler.php
if (!defined('ABSPATH')) {
    exit;
}

class ACP_Scheduler {
    
    private static $instance = null;
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Hook into WordPress cron
        add_action('acp_process_scheduled_posts', array($this, 'processScheduledPosts'));
        add_action('acp_cleanup_old_data', array($this, 'cleanupOldData'));
    }
    
    public function schedulePost($content_data, $publish_date) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_scheduled_posts';
        
        // Validate content data
        if (empty($content_data['external_id']) || empty($content_data['title'])) {
            throw new Exception('Missing required content data fields');
        }
        
        $result = $wpdb->insert(
            $table,
            array(
                'external_content_id' => $content_data['external_id'],
                'post_data' => json_encode($content_data),
                'scheduled_date' => $publish_date,
                'status' => 'pending'
            ),
            array('%s', '%s', '%s', '%s')
        );
        
        if ($result === false) {
            throw new Exception('Failed to insert scheduled post: ' . $wpdb->last_error);
        }
        
        return $wpdb->insert_id;
    }
    
    public function processScheduledPosts() {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_scheduled_posts';
        $current_time = current_time('mysql');
        
        // Get posts that are ready to be published
        $scheduled_posts = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table 
             WHERE status = 'pending' 
             AND scheduled_date <= %s 
             ORDER BY scheduled_date ASC 
             LIMIT 10",
            $current_time
        ));
        
        foreach ($scheduled_posts as $scheduled_post) {
            $this->processScheduledPost($scheduled_post);
        }
    }
    
    private function processScheduledPost($scheduled_post) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'acp_scheduled_posts';
        $start_time = microtime(true);
        
        try {
            // Update status to processing
            $wpdb->update(
                $table,
                array('status' => 'processing'),
                array('id' => $scheduled_post->id),
                array('%s'),
                array('%d')
            );
            
            // Decode post data
            $post_data = json_decode($scheduled_post->post_data, true);
            
            if (!$post_data) {
                throw new Exception('Invalid post data JSON');
            }
            
            // Create WordPress post
            $post_id = $this->createWordPressPost($post_data);
            
            if (!$post_id) {
                throw new Exception('Failed to create WordPress post');
            }
            
            // Update status to completed
            $wpdb->update(
                $table,
                array(
                    'status' => 'completed',
                    'error_message' => null
                ),
                array('id' => $scheduled_post->id),
                array('%s', '%s'),
                array('%d')
            );
            
            $execution_time = microtime(true) - $start_time;
            
            // Log success
            ACP_Analytics::logAction(
                $post_id,
                $scheduled_post->external_content_id,
                'scheduled_publish',
                'success',
                $execution_time
            );
            
            // Send webhook notification
            $this->sendWebhookNotification($scheduled_post->external_content_id, 'published', $post_id);
            
        } catch (Exception $e) {
            $execution_time = microtime(true) - $start_time;
            $max_retries = get_option('acp_max_retries', 3);
            
            // Increment retry count
            $new_retry_count = $scheduled_post->retry_count + 1;
            
            if ($new_retry_count >= $max_retries) {
                // Mark as failed
                $wpdb->update(
                    $table,
                    array(
                        'status' => 'failed',
                        'retry_count' => $new_retry_count,
                        'error_message' => $e->getMessage()
                    ),
                    array('id' => $scheduled_post->id),
                    array('%s', '%d', '%s'),
                    array('%d')
                );
            } else {
                // Schedule for retry (1 hour later)
                $retry_date = date('Y-m-d H:i:s', strtotime('+1 hour'));
                $wpdb->update(
                    $table,
                    array(
                        'status' => 'pending',
                        'retry_count' => $new_retry_count,
                        'scheduled_date' => $retry_date,
                        'error_message' => $e->getMessage()
                    ),
                    array('id' => $scheduled_post->id),
                    array('%s', '%d', '%s', '%s'),
                    array('%d')
                );
            }
            
            // Log failure
            ACP_Analytics::logAction(
                null,
                $scheduled_post->external_content_id,
                'scheduled_publish',
                'failed',
                $execution_time,
                $e->getMessage()
            );
            
            // Send webhook notification
            $this->sendWebhookNotification($scheduled_post->external_content_id, 'failed', null, $e->getMessage());
        }
    }
    
    public function createWordPressPost($post_data) {
        // Sanitize and prepare post data
        $wp_post_data = array(
            'post_title' => sanitize_text_field($post_data['title']),
            'post_content' => wp_kses_post($post_data['content']),
            'post_status' => 'publish',
            'post_type' => 'post',
            'post_author' => get_current_user_id() ?: 1
        );
        
        // Add optional fields
        if (!empty($post_data['excerpt'])) {
            $wp_post_data['post_excerpt'] = sanitize_textarea_field($post_data['excerpt']);
        }
        
        if (!empty($post_data['slug'])) {
            $wp_post_data['post_name'] = sanitize_title($post_data['slug']);
        }
        
        if (!empty($post_data['publish_date'])) {
            $wp_post_data['post_date'] = $post_data['publish_date'];
        }
        
        // Insert post
        $post_id = wp_insert_post($wp_post_data, true);
        
        if (is_wp_error($post_id)) {
            throw new Exception('WordPress error: ' . $post_id->get_error_message());
        }
        
        // Add categories
        if (!empty($post_data['categories']) && is_array($post_data['categories'])) {
            $category_ids = array();
            foreach ($post_data['categories'] as $category_name) {
                $category = get_category_by_slug(sanitize_title($category_name));
                if (!$category) {
                    $category_id = wp_create_category($category_name);
                } else {
                    $category_id = $category->term_id;
                }
                $category_ids[] = $category_id;
            }
            wp_set_post_categories($post_id, $category_ids);
        }
        
        // Add tags
        if (!empty($post_data['tags']) && is_array($post_data['tags'])) {
            wp_set_post_tags($post_id, $post_data['tags']);
        }
        
        // Add custom fields
        if (!empty($post_data['meta']) && is_array($post_data['meta'])) {
            foreach ($post_data['meta'] as $key => $value) {
                update_post_meta($post_id, sanitize_key($key), $value);
            }
        }
        
        // Store external content ID for reference
        update_post_meta($post_id, '_acp_external_id', $post_data['external_id']);
        
        return $post_id;
    }
    
    private function sendWebhookNotification($external_content_id, $status, $post_id = null, $error_message = null) {
        $webhook_url = get_option('acp_webhook_url', '');
        
        if (empty($webhook_url)) {
            return;
        }
        
        $notification_data = array(
            'external_content_id' => $external_content_id,
            'status' => $status,
            'timestamp' => current_time('mysql'),
            'site_url' => get_site_url()
        );
        
        if ($post_id) {
            $notification_data['post_id'] = $post_id;
            $notification_data['post_url'] = get_permalink($post_id);
        }
        
        if ($error_message) {
            $notification_data['error_message'] = $error_message;
        }
        
        wp_remote_post($webhook_url, array(
            'body' => json_encode($notification_data),
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-API-Key' => get_option('acp_api_key', '')
            ),
            'timeout' => 15,
            'blocking' => false // Don't wait for response
        ));
    }
    
    public function cleanupOldData() {
        global $wpdb;
        
        $cleanup_days = get_option('acp_cleanup_days', 30);
        $cleanup_date = date('Y-m-d H:i:s', strtotime("-$cleanup_days days"));
        
        $tables = array(
            $wpdb->prefix . 'acp_scheduled_posts',
            $wpdb->prefix . 'acp_analytics'
        );
        
        foreach ($tables as $table) {
            $wpdb->query($wpdb->prepare(
                "DELETE FROM $table WHERE created_at < %s AND status IN ('completed', 'failed')",
                $cleanup_date
            ));
        }
    }
}
?>