# ========================================
# CONTENT AUTOMATION SAAS - MVP TEST SUITE
# ========================================
# This script tests all MVP features systematically
# Run each section individually or all at once

$baseUrl = "http://localhost:5000"
$testEmail = "mvptest@test.com"
$testPassword = "TestMVP123@"
$adminEmail = "admin@mvptest.com"
$adminPassword = "AdminMVP123@"

Write-Host "🚀 Starting MVP Test Suite..." -ForegroundColor Green
Write-Host "Base URL: $baseUrl" -ForegroundColor Yellow
Write-Host "=" * 50

# ========================================
# 1. AUTHENTICATION TESTS
# ========================================
Write-Host "`n🔐 TESTING AUTHENTICATION..." -ForegroundColor Cyan

# Test 1.1: Create Admin User
Write-Host "`n1.1 Creating Admin User..." -ForegroundColor Yellow
try {
    $adminResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/create-admin" -Method POST -Body (ConvertTo-Json @{
        name = "MVP Test Admin"
        email = $adminEmail
        password = $adminPassword
        confirmPassword = $adminPassword
    }) -ContentType "application/json"
    
    Write-Host "✅ Admin created successfully" -ForegroundColor Green
    $adminToken = $adminResponse.token
    Write-Host "Admin Token: $($adminToken.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "⚠️ Admin creation: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
}

# Test 1.2: Admin Login
Write-Host "`n1.2 Testing Admin Login..." -ForegroundColor Yellow
try {
    $adminLoginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body (ConvertTo-Json @{
        email = $adminEmail
        password = $adminPassword
    }) -ContentType "application/json"
    
    Write-Host "✅ Admin login successful" -ForegroundColor Green
    $adminToken = $adminLoginResponse.token
    Write-Host "Credits: $($adminLoginResponse.user.credits)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Admin login failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 1.3: Regular User Registration
Write-Host "`n1.3 Testing User Registration..." -ForegroundColor Yellow
try {
    $userResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -Body (ConvertTo-Json @{
        name = "MVP Test User"
        email = $testEmail
        password = $testPassword
    }) -ContentType "application/json"
    
    Write-Host "✅ User registration successful" -ForegroundColor Green
    $userToken = $userResponse.token
    Write-Host "User ID: $($userResponse.user.id)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️ User registration: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
}

# Test 1.4: User Login
Write-Host "`n1.4 Testing User Login..." -ForegroundColor Yellow
try {
    $userLoginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body (ConvertTo-Json @{
        email = $testEmail
        password = $testPassword
    }) -ContentType "application/json"
    
    Write-Host "✅ User login successful" -ForegroundColor Green
    $userToken = $userLoginResponse.token
    Write-Host "Credits: $($userLoginResponse.user.credits)" -ForegroundColor Gray
} catch {
    Write-Host "❌ User login failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
    return
}

# Test 1.5: Get User Profile
Write-Host "`n1.5 Testing Get Profile..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $profileResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/profile" -Method GET -Headers $headers
    
    Write-Host "✅ Profile retrieved successfully" -ForegroundColor Green
    Write-Host "Name: $($profileResponse.user.name)" -ForegroundColor Gray
    Write-Host "Credits: $($profileResponse.user.credits)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Get profile failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# ========================================
# 2. CONTENT GENERATION TESTS
# ========================================
Write-Host "`n📝 TESTING CONTENT GENERATION..." -ForegroundColor Cyan

# Test 2.1: Generate Blog Post
Write-Host "`n2.1 Testing Blog Post Generation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $blogResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/generate" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        type = "blog_post"
        topic = "Benefits of AI in Content Marketing"
        tone = "professional"
        wordCount = 500
        keywords = @("AI", "content marketing", "automation")
    })
    
    Write-Host "✅ Blog post generated successfully" -ForegroundColor Green
    Write-Host "Content ID: $($blogResponse.content.id)" -ForegroundColor Gray
    Write-Host "Length: $($blogResponse.content.generatedContent.Length) characters" -ForegroundColor Gray
} catch {
    Write-Host "❌ Blog generation failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 2.2: Generate Social Media Post
Write-Host "`n2.2 Testing Social Media Generation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $socialResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/generate" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        type = "social_media"
        platform = "linkedin"
        topic = "Remote work productivity tips"
        tone = "engaging"
        includeHashtags = $true
    })
    
    Write-Host "✅ Social media post generated successfully" -ForegroundColor Green
    Write-Host "Content ID: $($socialResponse.content.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Social media generation failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 2.3: Generate Email Newsletter
Write-Host "`n2.3 Testing Email Newsletter Generation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $emailResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/generate" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        type = "email_newsletter"
        subject = "Weekly Tech Updates"
        tone = "friendly"
        audience = "tech professionals"
        sections = @("intro", "main_content", "call_to_action")
    })
    
    Write-Host "✅ Email newsletter generated successfully" -ForegroundColor Green
    Write-Host "Content ID: $($emailResponse.content.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Email generation failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 2.4: Generate Product Description
Write-Host "`n2.4 Testing Product Description Generation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $productResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/generate" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        type = "product_description"
        productName = "Smart Wireless Headphones"
        features = @("noise cancellation", "40-hour battery", "wireless charging")
        targetAudience = "music lovers"
        tone = "persuasive"
    })
    
    Write-Host "✅ Product description generated successfully" -ForegroundColor Green
    Write-Host "Content ID: $($productResponse.content.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Product description generation failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 2.5: Generate SEO Meta Description
Write-Host "`n2.5 Testing SEO Meta Description Generation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $seoResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/generate" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        type = "seo_meta"
        pageTitle = "Best Content Automation Tools 2024"
        keywords = @("content automation", "AI writing", "marketing tools")
        maxLength = 160
    })
    
    Write-Host "✅ SEO meta description generated successfully" -ForegroundColor Green
    Write-Host "Content ID: $($seoResponse.content.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ SEO generation failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# ========================================
# 3. CONTENT MANAGEMENT TESTS
# ========================================
Write-Host "`n📚 TESTING CONTENT MANAGEMENT..." -ForegroundColor Cyan

# Test 3.1: Get Content History
Write-Host "`n3.1 Testing Content History..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $historyResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/history" -Method GET -Headers $headers
    
    Write-Host "✅ Content history retrieved successfully" -ForegroundColor Green
    Write-Host "Total items: $($historyResponse.content.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Content history failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 3.2: Get Single Content Item
Write-Host "`n3.2 Testing Single Content Retrieval..." -ForegroundColor Yellow
if ($blogResponse -and $blogResponse.content.id) {
    try {
        $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
        $singleContentResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/$($blogResponse.content.id)" -Method GET -Headers $headers
        
        Write-Host "✅ Single content retrieved successfully" -ForegroundColor Green
        Write-Host "Title: $($singleContentResponse.content.title)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Single content retrieval failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ No content ID available for single content test" -ForegroundColor Yellow
}

# Test 3.3: Update Content
Write-Host "`n3.3 Testing Content Update..." -ForegroundColor Yellow
if ($blogResponse -and $blogResponse.content.id) {
    try {
        $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
        $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/$($blogResponse.content.id)" -Method PUT -Headers $headers -Body (ConvertTo-Json @{
            title = "Updated: Benefits of AI in Content Marketing"
            generatedContent = "This is updated content..."
        })
        
        Write-Host "✅ Content updated successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Content update failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ No content ID available for update test" -ForegroundColor Yellow
}

# ========================================
# 4. TEMPLATES TESTS
# ========================================
Write-Host "`n📋 TESTING TEMPLATES..." -ForegroundColor Cyan

# Test 4.1: Get Available Templates
Write-Host "`n4.1 Testing Templates List..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $templatesResponse = Invoke-RestMethod -Uri "$baseUrl/api/templates" -Method GET -Headers $headers
    
    Write-Host "✅ Templates retrieved successfully" -ForegroundColor Green
    Write-Host "Available templates: $($templatesResponse.templates.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Templates retrieval failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 4.2: Create Custom Template
Write-Host "`n4.2 Testing Template Creation..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $templateResponse = Invoke-RestMethod -Uri "$baseUrl/api/templates" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        name = "Custom Blog Template"
        type = "blog_post"
        structure = @{
            introduction = "Hook and introduction"
            mainPoints = @("Point 1", "Point 2", "Point 3")
            conclusion = "Summary and call-to-action"
        }
        variables = @("topic", "tone", "audience")
    })
    
    Write-Host "✅ Template created successfully" -ForegroundColor Green
    Write-Host "Template ID: $($templateResponse.template.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Template creation failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# ========================================
# 5. CREDITS SYSTEM TESTS
# ========================================
Write-Host "`n💳 TESTING CREDITS SYSTEM..." -ForegroundColor Cyan

# Test 5.1: Check Credit Balance
Write-Host "`n5.1 Testing Credit Balance..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $creditsResponse = Invoke-RestMethod -Uri "$baseUrl/api/user/credits" -Method GET -Headers $headers
    
    Write-Host "✅ Credit balance retrieved successfully" -ForegroundColor Green
    Write-Host "Current credits: $($creditsResponse.credits)" -ForegroundColor Gray
    Write-Host "Used this month: $($creditsResponse.usedThisMonth)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Credit balance check failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 5.2: Check Usage Statistics
Write-Host "`n5.2 Testing Usage Statistics..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $usageResponse = Invoke-RestMethod -Uri "$baseUrl/api/user/usage" -Method GET -Headers $headers
    
    Write-Host "✅ Usage statistics retrieved successfully" -ForegroundColor Green
    Write-Host "Total generations: $($usageResponse.totalGenerations)" -ForegroundColor Gray
    Write-Host "This month: $($usageResponse.thisMonth)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Usage statistics failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# ========================================
# 6. PAYMENT SYSTEM TESTS
# ========================================
Write-Host "`n💰 TESTING PAYMENT SYSTEM..." -ForegroundColor Cyan

# Test 6.1: Get Pricing Plans
Write-Host "`n6.1 Testing Pricing Plans..." -ForegroundColor Yellow
try {
    $pricingResponse = Invoke-RestMethod -Uri "$baseUrl/api/billing/plans" -Method GET
    
    Write-Host "✅ Pricing plans retrieved successfully" -ForegroundColor Green
    Write-Host "Available plans: $($pricingResponse.plans.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Pricing plans failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 6.2: Create Payment Intent (Test Mode)
Write-Host "`n6.2 Testing Payment Intent..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $paymentResponse = Invoke-RestMethod -Uri "$baseUrl/api/billing/purchase-credits" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        credits = 100
        amount = 999  # $9.99 in cents
    })
    
    Write-Host "✅ Payment intent created successfully" -ForegroundColor Green
    Write-Host "Payment ID: $($paymentResponse.paymentIntent.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Payment intent failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# ========================================
# 7. ADMIN PANEL TESTS
# ========================================
Write-Host "`n👑 TESTING ADMIN FEATURES..." -ForegroundColor Cyan

# Test 7.1: Get All Users (Admin Only)
Write-Host "`n7.1 Testing Admin - Get Users..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $adminToken"; "Content-Type" = "application/json" }
    $usersResponse = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Method GET -Headers $headers
    
    Write-Host "✅ Admin users list retrieved successfully" -ForegroundColor Green
    Write-Host "Total users: $($usersResponse.users.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Admin users list failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Test 7.2: Get System Statistics (Admin Only)
Write-Host "`n7.2 Testing Admin - System Stats..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $adminToken"; "Content-Type" = "application/json" }
    $statsResponse = Invoke-RestMethod -Uri "$baseUrl/api/admin/stats" -Method GET -Headers $headers
    
    Write-Host "✅ System statistics retrieved successfully" -ForegroundColor Green
    Write-Host "Total generations today: $($statsResponse.generationsToday)" -ForegroundColor Gray
    Write-Host "Active users: $($statsResponse.activeUsers)" -ForegroundColor Gray
} catch {
    Write-Host "❌ System statistics failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# ========================================
# 8. ERROR HANDLING TESTS
# ========================================
Write-Host "`n🚨 TESTING ERROR HANDLING..." -ForegroundColor Cyan

# Test 8.1: Invalid Token
Write-Host "`n8.1 Testing Invalid Token..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer invalid_token"; "Content-Type" = "application/json" }
    $errorResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/generate" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        type = "blog_post"
        topic = "Test"
    })
    
    Write-Host "❌ Should have failed with invalid token" -ForegroundColor Red
} catch {
    Write-Host "✅ Invalid token properly rejected" -ForegroundColor Green
}

# Test 8.2: Insufficient Credits
Write-Host "`n8.2 Testing Insufficient Credits..." -ForegroundColor Yellow
# This would require reducing user credits to 0 first
Write-Host "⚠️ Manual test required - reduce user credits to 0 and try generation" -ForegroundColor Yellow

# Test 8.3: Rate Limiting
Write-Host "`n8.3 Testing Rate Limiting..." -ForegroundColor Yellow
Write-Host "⚠️ Manual test required - make rapid requests to test rate limiting" -ForegroundColor Yellow

# ========================================
# 9. PERFORMANCE TESTS
# ========================================
Write-Host "`n⚡ TESTING PERFORMANCE..." -ForegroundColor Cyan

# Test 9.1: Generation Speed
Write-Host "`n9.1 Testing Generation Speed..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $userToken"; "Content-Type" = "application/json" }
    $startTime = Get-Date
    
    $speedResponse = Invoke-RestMethod -Uri "$baseUrl/api/content/generate" -Method POST -Headers $headers -Body (ConvertTo-Json @{
        type = "social_media"
        topic = "Quick performance test"
        tone = "casual"
    })
    
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host "✅ Generation completed in $duration seconds" -ForegroundColor Green
} catch {
    Write-Host "❌ Performance test failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# ========================================
# TEST SUMMARY
# ========================================
Write-Host "`n" + "=" * 50
Write-Host "🎯 MVP TEST SUITE COMPLETED" -ForegroundColor Green
Write-Host "=" * 50

Write-Host "`n📊 SUMMARY:" -ForegroundColor Cyan
Write-Host "✅ Authentication System - Check logs above"
Write-Host "✅ Content Generation - Check logs above"
Write-Host "✅ Content Management - Check logs above"
Write-Host "✅ Templates System - Check logs above"
Write-Host "✅ Credits System - Check logs above"
Write-Host "✅ Payment System - Check logs above"
Write-Host "✅ Admin Features - Check logs above"
Write-Host "✅ Error Handling - Check logs above"
Write-Host "✅ Performance - Check logs above"

Write-Host "`n🔍 MANUAL TESTS REQUIRED:" -ForegroundColor Yellow
Write-Host "- Frontend UI testing"
Write-Host "- Email functionality (if implemented)"
Write-Host "- File uploads/exports"
Write-Host "- Mobile responsiveness"
Write-Host "- Cross-browser compatibility"

Write-Host "`n🚀 READY FOR PRODUCTION CHECKLIST:" -ForegroundColor Magenta
Write-Host "- [ ] All API tests passing"
Write-Host "- [ ] Frontend connected and working"
Write-Host "- [ ] Payment system fully functional"
Write-Host "- [ ] Security audit completed"
Write-Host "- [ ] Performance optimization done"
Write-Host "- [ ] Error monitoring setup"
Write-Host "- [ ] Backup strategy implemented"

Write-Host "`n✨ MVP TEST SUITE FINISHED!" -ForegroundColor Green