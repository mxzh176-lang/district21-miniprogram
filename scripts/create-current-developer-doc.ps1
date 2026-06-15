param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$document = $word.Documents.Add()

try {
    $selection = $word.Selection
    $lines = Get-Content -LiteralPath $SourcePath -Encoding UTF8

    foreach ($line in $lines) {
        if ($line -match '^# (.+)$') {
            $selection.Style = -2
            $selection.TypeText($Matches[1])
            $selection.TypeParagraph()
        } elseif ($line -match '^## (.+)$') {
            $selection.Style = -3
            $selection.TypeText($Matches[1])
            $selection.TypeParagraph()
        } elseif ($line -match '^### (.+)$') {
            $selection.Style = -4
            $selection.TypeText($Matches[1])
            $selection.TypeParagraph()
        } elseif ($line -match '^- (.+)$') {
            $selection.Style = -1
            $selection.Range.ListFormat.ApplyBulletDefault()
            $selection.TypeText($Matches[1])
            $selection.TypeParagraph()
            $selection.Range.ListFormat.RemoveNumbers()
        } elseif ($line -match '^\d+\. (.+)$') {
            $selection.Style = -1
            $selection.Range.ListFormat.ApplyNumberDefault()
            $selection.TypeText($Matches[1])
            $selection.TypeParagraph()
            $selection.Range.ListFormat.RemoveNumbers()
        } elseif ([string]::IsNullOrWhiteSpace($line)) {
            $selection.TypeParagraph()
        } else {
            $selection.Style = -1
            $selection.TypeText(($line -replace '`', ''))
            $selection.TypeParagraph()
        }
    }

    $document.SaveAs2($OutputPath, 16)
} finally {
    $document.Close($false)
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output $OutputPath
