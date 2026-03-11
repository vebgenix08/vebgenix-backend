$env:Path += ";C:\Program Files\Amazon\SessionManagerPlugin\bin"
$instanceId = "i-02e5dec788bea0d12"
$region = "ap-south-1"
$dbHost = "vebgenix-dev.cbk0wcau48o4.ap-south-1.rds.amazonaws.com"

Write-Host "Starting port forwarding to RDS ($dbHost) via Bastion ($instanceId)..."
aws ssm start-session --target $instanceId --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "{\`"host\`":[\`"$dbHost\`"],\`"portNumber\`":[\`"5432\`"],\`"localPortNumber\`":[\`"5432\`"]}" --region $region