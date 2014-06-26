/*!
 * Froxy
 * Copyright (c) 2014 Leonard Wu <leonard.wu92@alumni.ic.ac.uk>
 * https://github.com/leonardw/froxy
 * MIT Licensed
 */
(function () {
	var request = require('request');

	function getTranslateFn(translateParam) {
		if (translateParam instanceof Function) {
			// param is already a function, return as is
			return translateParam;
		} else if (translateParam instanceof Array) {
			// param is an array of either [basePath, tranlatePath] or [regexPattern, translateTemplate]
			if (translateParam[0] instanceof Object) {
				// First param is a regex pattern object, of form [regexPattern, translateTemplate]
				return function(url) {
					try {
						return url.replace(translateParam[0], translateParam[1]);
					} catch (ex) {
						console.error('URL RegExp translation error:', ex);
					}
					return null;
				};
			} else {
				// First param should be a string, of form [basePath, tranlatePath]
				return function(url) {
					if (url.indexOf(translateParam[0]) === 0) {
						return translateParam[1] + url.substring(translateParam[0].length);
					} else {
						console.error('URL translation failed to match:', translateParam[0]);
						return null;
					}
				};
			}
		} else {
			// no translation will be done
			return null;
		}
	}

	// Get the request specification, i.e. host, port, and protocol
	function getRequestSpec(req) {
		var host_port = req.headers.host.split(':'),
			protocol = req.connection.encrypted ? 'https' : 'http';
		return {
			host: host_port[0],
			port: host_port[1] ? parseInt(host_port[1], 10) : null,
			protocol: protocol
		};
	}

	// Given config options, creates a handler for proxying requests
	function proxy(option) {
		// Set defaults
		var cfg = {
			host: option.host || null,
			port: option.port || null,
			protocol: option.protocol || null,
			translate: getTranslateFn(option.translate),
			debug: option.debug === true
		};
		
		// Return the request handler function
		return function(req, res) {
			var reqSpec = getRequestSpec(req);
			if (cfg.debug) {
				console.info('Request:', reqSpec);
			}
			// Translate the relative part of URL
			var rewriteUrl = (cfg.translate? cfg.translate(req.url, req) : req.url);
			if (rewriteUrl === null) {
				console.error('Failed to translate URL:', req.url);
				// Failed to translate, return 404 Not Found
				res.writeHead(404);
				res.end('<html><head><title>Error 404 - Page Not Found</title></head><body><h1>Error 404 - Page Not Found</h1><p>Your requested page is not found.</p></body></html>');
			} else {
				// Build Fully-qualified URL for rewrite
				var fqRewriteUrl = (cfg.protocol ? cfg.protocol : reqSpec.protocol) + "://"
					+ (cfg.host ? cfg.host : reqSpec.host)
					+ (cfg.port ? ':'+cfg.port : (cfg.host ? '' : (reqSpec.port ? ':'+reqSpec.port : '')))
					+ rewriteUrl;
				if (cfg.debug) {
					console.info('URL:', req.url);
					console.info('Rewrite:', fqRewriteUrl);
					console.info('');
				}
				// Proxy request to the rewritten URL, and pipe back the response
				req.pipe(request(fqRewriteUrl)).pipe(res);
			}
			return;
		};
	}
	
	var _api = {
		proxy: proxy
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		// Running in Node.js
		module.exports = _api;
	} else {
		// We are lost
		console.error('Unknown execution environment. Giving up.');
	}
	
})();

