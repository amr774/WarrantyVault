Add-Type -AssemblyName System.Drawing
foreach ($size in @(192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#6d4aff'))
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, $size / 24)
  $points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($size*.5, $size*.24),
    [System.Drawing.PointF]::new($size*.74, $size*.33),
    [System.Drawing.PointF]::new($size*.72, $size*.58),
    [System.Drawing.PointF]::new($size*.63, $size*.71),
    [System.Drawing.PointF]::new($size*.5, $size*.79),
    [System.Drawing.PointF]::new($size*.37, $size*.71),
    [System.Drawing.PointF]::new($size*.28, $size*.58),
    [System.Drawing.PointF]::new($size*.26, $size*.33)
  )
  $graphics.DrawPolygon($pen, $points)
  $graphics.DrawLines($pen, [System.Drawing.PointF[]]@([System.Drawing.PointF]::new($size*.38,$size*.5),[System.Drawing.PointF]::new($size*.47,$size*.59),[System.Drawing.PointF]::new($size*.64,$size*.4)))
  $bitmap.Save((Join-Path $PSScriptRoot "../apps/web/public/icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
