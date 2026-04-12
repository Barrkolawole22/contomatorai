<?php
// includes/class-authentication.php
if (!defined('ABSPATH')) {
    exit;
}

class ACP_Authentication {
    
    public static function validateApplicationPassword($username, $password) {
        if (empty($username) || empty($password)) {
            return false;
        }
        
        $user = get_user_by('login', $username);
        if (!$user) {
            return false;
        }
        
        // Check if this is a valid application password
        // WordPress 5.6+ has built-in application password support
        if (function_exists('wp_validate_application_password')) {
            return wp_validate_application_password($user->ID, $password);
        }
        
        // Fallback for older WordPress versions
        return wp_authenticate_application_password(null, $user->ID, $password);
    }
    
    public static function getApiKey() {
        $api_key = get_option('acp_api_key', '');
        if (empty($api_key)) {
            $api_key = wp_generate_password(32, false);
            update_option('acp_api_key', $api_key);
        }
        return $api_key;
    }
}
?>