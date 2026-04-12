<?php
// admin/main-page.php
?>
<div class="wrap">
    <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
    
    <div class="acp-dashboard">
        <div class="acp-row">
            <div class="acp-col-8">
                <div class="acp-card">
                    <h2>Scheduled Posts</h2>
                    <div class="acp-table-container">
                        <?php if (!empty($scheduled_posts)): ?>
                            <table class="wp-list-table widefat fixed striped">
                                <thead>
                                    <tr>
                                        <th>External ID</th>
                                        <th>Scheduled Date</th>
                                        <th>Status</th>
                                        <th>Retry Count</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ($scheduled_posts as $post): ?>
                                        <tr>
                                            <td><?php echo esc_html($post->external_content_id); ?></td>
                                            <td><?php echo esc_html(date('Y-m-d H:i:s', strtotime($post->scheduled_date))); ?></td>
                                            <td>
                                                <span class="acp-status acp-status-<?php echo esc_attr($post->status); ?>">
                                                    <?php echo esc_html(ucfirst($post->status)); ?>
                                                </span>
                                            </td>
                                            <td><?php echo esc_html($post->retry_count); ?></td>
                                            <td>
                                                <?php if ($post->status === 'pending'): ?>
                                                    <button class="button button-small acp-cancel-schedule" 
                                                            data-id="<?php echo esc_attr($post->id); ?>">
                                                        Cancel
                                                    </button>
                                                <?php endif; ?>
                                                <?php if ($post->error_message): ?>
                                                    <button class="button button-small acp-view-error" 
                                                            data-error="<?php echo esc_attr($post->error_message); ?>">
                                                        View Error
                                                    </button>
                                                <?php endif; ?>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        <?php else: ?>
                            <p>No scheduled posts found.</p>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
            
            <div class="acp-col-4">
                <div class="acp-card">
                    <h3>Quick Stats</h3>
                    <div class="acp-stats">
                        <div class="acp-stat">
                            <div class="acp-stat-number" id="pending-count">-</div>
                            <div class="acp-stat-label">Pending Posts</div>
                        </div>
                        <div class="acp-stat">
                            <div class="acp-stat-number" id="published-today">-</div>
                            <div class="acp-stat-label">Published Today</div>
                        </div>
                        <div class="acp-stat">
                            <div class="acp-stat-number" id="failed-today">-</div>
                            <div class="acp-stat-label">Failed Today</div>
                        </div>
                    </div>
                </div>
                
                <div class="acp-card">
                    <h3>System Status</h3>
                    <div class="acp-system-status">
                        <div class="acp-status-item">
                            <span class="acp-status-label">Cron Jobs:</span>
                            <span class="acp-status-value" id="cron-status">-</span>
                        </div>
                        <div class="acp-status-item">
                            <span class="acp-status-label">Last Processed:</span>
                            <span class="acp-status-value" id="last-processed">-</span>
                        </div>
                        <div class="acp-status-item">
                            <span class="acp-status-label">API Status:</span>
                            <span class="acp-status-value" id="api-status">-</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Error Modal -->
<div id="acp-error-modal" class="acp-modal" style="display: none;">
    <div class="acp-modal-content">
        <div class="acp-modal-header">
            <h3>Error Details</h3>
            <span class="acp-modal-close">&times;</span>
        </div>
        <div class="acp-modal-body">
            <pre id="acp-error-content"></pre>
        </div>
    </div>
</div>

<?php