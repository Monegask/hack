/* Original Supply Line pictograms; the robot is not a brand logo. */
(function(root){
 'use strict';
 const paths={
  online:'<circle cx="16" cy="16" r="11.5"/><ellipse cx="16" cy="16" rx="5" ry="11.5"/><path d="M5 16h22M7.2 9.2c5.6 2.2 12 2.2 17.6 0M7.2 22.8c5.6-2.2 12-2.2 17.6 0"/>',
  tutorial:'<path d="M16 8.4C12.7 5.8 8.6 5.5 4.5 6.7v18c4.1-1.2 8.2-.9 11.5 1.7 3.3-2.6 7.4-2.9 11.5-1.7v-18C23.4 5.5 19.3 5.8 16 8.4Z"/><path d="M16 8.4v18M8 11.5c1.7-.2 3.2.1 4.6.8M8 16c1.7-.2 3.2.1 4.6.8M19.4 12.3c1.4-.7 2.9-1 4.6-.8M19.4 16.8c1.4-.7 2.9-1 4.6-.8"/>',
  bot:'<path d="M16 8V4h5"/><circle cx="23" cy="4" r="2"/><path d="m8 9-3 4v10l3 4h16l3-4V13l-3-4H8Z"/><path d="M5 15H2v6h3M27 15h3v6h-3M12 22h8"/><rect x="9.5" y="14" width="4" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="18.5" y="14" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>'
 };
 root.SupplyLineMenuIcon=kind=>'<svg class="menu-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paths[kind]||paths.bot)+'</svg>';
})(globalThis);
