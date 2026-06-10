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
  <!-- cross carved in bg color -->
  <line x1="12" y1="8" x2="12" y2="14" stroke="var(--bg)" stroke-width="1.5" />
  <line x1="9.5" y1="11" x2="14.5" y2="11" stroke="var(--bg)" stroke-width="1.5" />
</svg>
