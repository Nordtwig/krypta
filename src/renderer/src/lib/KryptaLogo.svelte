<script>
  let { size = 14, color = 'currentColor' } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <!-- filled gravestone body -->
  <path d="M7 21V12a5 5 0 0 1 10 0v9Z" fill={color} />
  <!-- filled base -->
  <rect x="5" y="20" width="14" height="2" fill={color} />
  <!-- seam between stone and base -->
  <line x1="7" y1="20" x2="17" y2="20" stroke="var(--bg)" stroke-width="1" stroke-opacity="1" />
</svg>
