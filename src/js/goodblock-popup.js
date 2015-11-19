
// Create the popup iframe.
function setupDashboard() {
	var iframe = document.createElement('iframe');
	iframe.id = 'dashboard';
	iframe.src = 'https://goodblock.org/app/dashboard/';
	var parent = document.getElementById('dashboard-container');
	parent.appendChild(iframe);
}

window.onload = function(e){ 
	// Delay to allow for quicker popup loading.
	setTimeout(function() {
		setupDashboard();
	}, 10);
}
