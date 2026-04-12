// admin/analytics-page.php
?>
<div class="wrap">
    <h1>Publishing Analytics</h1>
    
    <div class="acp-analytics-dashboard">
        <div class="acp-row">
            <div class="acp-col-12">
                <div class="acp-card">
                    <h2>Publishing Statistics (Last 30 Days)</h2>
                    <div class="acp-stats-grid">
                        <div class="acp-stat-card">
                            <div class="acp-stat-number">
                                <?php echo esc_html($stats->total_attempts ?? 0); ?>
                            </div>
                            <div class="acp-stat-label">Total Attempts</div>
                        </div>
                        
                        <div class="acp-stat-card success">
                            <div class="acp-stat-number">
                                <?php echo esc_html($stats->successful_publishes ?? 0); ?>
                            </div>
                            <div class="acp-stat-label">Successful</div>
                        </div>
                        
                        <div class="acp-stat-card error">
                            <div class="acp-stat-number">
                                <?php echo esc_html($stats->failed_publishes ?? 0); ?>
                            </div>
                            <div class="acp-stat-label">Failed</div>
                        </div>
                        
                        <div class="acp-stat-card">
                            <div class="acp-stat-number">
                                <?php 
                                $success_rate = 0;
                                if ($stats && $stats->total_attempts > 0) {
                                    $success_rate = round(($stats->successful_publishes / $stats->total_attempts) * 100, 1);
                                }
                                echo esc_html($success_rate . '%');
                                ?>
                            </div>
                            <div class="acp-stat-label">Success Rate</div>
                        </div>
                        
                        <div class="acp-stat-card">
                            <div class="acp-stat-number">
                                <?php 
                                $avg_time = $stats->avg_execution_time ?? 0;
                                echo esc_html(number_format($avg_time, 2) . 's');
                                ?>
                            </div>
                            <div class="acp-stat-label">Avg. Execution Time</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="acp-row">
            <div class="acp-col-8">
                <div class="acp-card">
                    <h3>Recent Activity</h3>
                    <div class="acp-activity-list">
                        <?php if (!empty($recent_activity)): ?>
                            <table class="wp-list-table widefat fixed striped">
                                <thead>
                                    <tr>
                                        <th>Content ID</th>
                                        <th>Action</th>
                                        <th>Status</th>
                                        <th>Execution Time</th>
                                        <th>Date</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ($recent_activity as $activity): ?>
                                        <tr>
                                            <td>
                                                <code><?php echo esc_html(substr($activity->external_content_id, -8)); ?></code>
                                            </td>
                                            <td><?php echo esc_html(ucfirst(str_replace('_', ' ', $activity->action_type))); ?></td>
                                            <td>
                                                <span class="acp-status acp-status-<?php echo esc_attr($activity->status); ?>">
                                                    <?php echo esc_html(ucfirst($activity->status)); ?>
                                                </span>
                                            </td>
                                            <td><?php echo esc_html(number_format($activity->execution_time, 2) . 's'); ?></td>
                                            <td><?php echo esc_html(date('M j, Y H:i', strtotime($activity->created_at))); ?></td>
                                            <td>
                                                <?php if ($activity->post_id): ?>
                                                    <a href="<?php echo esc_url(get_edit_post_link($activity->post_id)); ?>" 
                                                       target="_blank">View Post</a>
                                                <?php endif; ?>
                                                <?php if ($activity->error_details): ?>
                                                    <button class="button button-small acp-view-error" 
                                                            data-error="<?php echo esc_attr($activity->error_details); ?>">
                                                        Error
                                                    </button>
                                                <?php endif; ?>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        <?php else: ?>
                            <p>No recent activity found.</p>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
            
            <div class="acp-col-4">
                <div class="acp-card">
                    <h3>Performance Chart</h3>
                    <canvas id="performance-chart" width="300" height="200"></canvas>
                </div>
                
                <div class="acp-card">
                    <h3>Export Data</h3>
                    <p>Export analytics data for external analysis.</p>
                    <button type="button" id="export-csv" class="button button-secondary">
                        Export CSV
                    </button>
                    <button type="button" id="export-json" class="button button-secondary">
                        Export JSON
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<?php