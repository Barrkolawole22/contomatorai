jQuery(document).ready(function($) {
    // Load dashboard stats
    loadDashboardStats();
    
    // Auto-refresh every 30 seconds
    setInterval(loadDashboardStats, 30000);
    
    // Modal functionality
    $('.acp-view-error').on('click', function() {
        var errorMessage = $(this).data('error');
        $('#acp-error-content').text(errorMessage);
        $('#acp-error-modal').show();
    });
    
    $('.acp-modal-close').on('click', function() {
        $('.acp-modal').hide();
    });
    
    $(window).on('click', function(event) {
        if ($(event.target).hasClass('acp-modal')) {
            $('.acp-modal').hide();
        }
    });
    
    // Cancel scheduled post
    $('.acp-cancel-schedule').on('click', function() {
        var scheduleId = $(this).data('id');
        var $row = $(this).closest('tr');
        
        if (confirm('Are you sure you want to cancel this scheduled post?')) {
            $.ajax({
                url: acpAjax.restUrl + 'cancel-schedule/' + scheduleId,
                method: 'POST',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', acpAjax.nonce);
                },
                success: function(response) {
                    $row.fadeOut();
                    showNotice('Scheduled post cancelled successfully', 'success');
                },
                error: function(xhr) {
                    showNotice('Failed to cancel scheduled post', 'error');
                }
            });
        }
    });
    
    // Test webhook
    $('#test-webhook').on('click', function() {
        var $button = $(this);
        var $result = $('#webhook-test-result');
        
        $button.prop('disabled', true).text('Testing...');
        
        $.ajax({
            url: acpAjax.ajaxurl,
            method: 'POST',
            data: {
                action: 'acp_test_webhook',
                nonce: acpAjax.nonce
            },
            success: function(response) {
                if (response.success) {
                    $result.html('<div class="notice notice-success"><p>Webhook test successful!</p></div>');
                } else {
                    $result.html('<div class="notice notice-error"><p>Webhook test failed: ' + response.data + '</p></div>');
                }
            },
            error: function() {
                $result.html('<div class="notice notice-error"><p>Webhook test failed</p></div>');
            },
            complete: function() {
                $button.prop('disabled', false).text('Test Webhook');
            }
        });
    });
    
    // Manual cleanup
    $('#manual-cleanup').on('click', function() {
        var $button = $(this);
        var $result = $('#cleanup-result');
        
        if (!confirm('Are you sure you want to clean up old records?')) {
            return;
        }
        
        $button.prop('disabled', true).text('Cleaning...');
        
        $.ajax({
            url: acpAjax.ajaxurl,
            method: 'POST',
            data: {
                action: 'acp_manual_cleanup',
                nonce: acpAjax.nonce
            },
            success: function(response) {
                if (response.success) {
                    $result.html('<div class="notice notice-success"><p>Cleanup completed: ' + response.data.records_deleted + ' records removed</p></div>');
                } else {
                    $result.html('<div class="notice notice-error"><p>Cleanup failed: ' + response.data + '</p></div>');
                }
            },
            error: function() {
                $result.html('<div class="notice notice-error"><p>Cleanup failed</p></div>');
            },
            complete: function() {
                $button.prop('disabled', false).text('Run Cleanup Now');
            }
        });
    });
    
    // Export functionality
    $('#export-csv').on('click', function() {
        window.location.href = acpAjax.restUrl + 'export/csv?_wpnonce=' + acpAjax.nonce;
    });
    
    $('#export-json').on('click', function() {
        window.location.href = acpAjax.restUrl + 'export/json?_wpnonce=' + acpAjax.nonce;
    });
    
    function loadDashboardStats() {
        $.ajax({
            url: acpAjax.restUrl + 'dashboard-stats',
            method: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', acpAjax.nonce);
            },
            success: function(response) {
                $('#pending-count').text(response.pending_count || 0);
                $('#published-today').text(response.published_today || 0);
                $('#failed-today').text(response.failed_today || 0);
                
                // Update system status
                $('#cron-status').text(response.cron_running ? 'Running' : 'Stopped')
                    .removeClass('acp-status-success acp-status-error')
                    .addClass(response.cron_running ? 'acp-status-success' : 'acp-status-error');
                    
                $('#last-processed').text(response.last_processed || 'Never');
                $('#api-status').text(response.api_accessible ? 'Connected' : 'Disconnected')
                    .removeClass('acp-status-success acp-status-error')
                    .addClass(response.api_accessible ? 'acp-status-success' : 'acp-status-error');
            },
            error: function() {
                console.log('Failed to load dashboard stats');
            }
        });
    }
    
    function showNotice(message, type) {
        var noticeClass = type === 'success' ? 'notice-success' : 'notice-error';
        var $notice = $('<div class="notice ' + noticeClass + ' is-dismissible"><p>' + message + '</p></div>');
        
        $('.wrap h1').after($notice);
        
        setTimeout(function() {
            $notice.fadeOut();
        }, 5000);
    }
});