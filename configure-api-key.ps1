# Run with: powershell.exe -NoProfile -ExecutionPolicy Bypass -File <this script>
$ErrorActionPreference = 'Stop'
$keyText = $null
try {
    Write-Host '请先在硅基流动网站复制完整 API Key。密钥不会显示，也不要粘贴到聊天里。'
    $null = Read-Host '复制完成后按回车；本脚本将从剪贴板读取密钥'
    $keyText = (Get-Clipboard -Raw).Trim()
    if ($keyText.Length -lt 20 -or $keyText -notmatch '^[\x21-\x7e]{20,}$') {
        throw '剪贴板内容不是有效的 API Key 格式。未修改已有配置，请重新复制完整密钥后重试。'
    }
    [Environment]::SetEnvironmentVariable('SILICONFLOW_API_KEY', $keyText, 'User')
    $env:SILICONFLOW_API_KEY = $keyText
    $savedText = [Environment]::GetEnvironmentVariable('SILICONFLOW_API_KEY', 'User')
    if ($savedText -cne $keyText) { throw '保存后的配置与输入不一致，请检查用户环境变量写入权限。' }
    Write-Host '密钥格式正常，已保存并验证。请回到聊天回复“已修复”。'
    Write-Host '这是本地格式和保存校验，服务端有效性将在转写请求时确认。'
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    $keyText = $null
    $savedText = $null
}
