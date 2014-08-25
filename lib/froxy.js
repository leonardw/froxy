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
			// param is an array of either [prefixPath, tranlatePrefixPath] or [regexPattern, translateTemplate]
			if (translateParam[0] instanceof Object) {
				// First param is a regex pattern object, of form [regexPattern, translateTemplate]
				return function(url) {
					try {
						return url.replace(translateParam[0], translateParam[1]);
					} catch (ex) {
						console.error('URL regex translation error:', ex);
					}
					return null;
				};
			} else {
				// First param should be a string, of form [prefixPath, tranlatePrefixPath]
				return function(url) {
					if (url.indexOf(translateParam[0]) === 0) {
						return translateParam[1] + url.substring(translateParam[0].length);
					} else {
						console.error('URL translation failed to match "%s"', translateParam[0]);
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
			secure = req.connection.encrypted ? true : false,
			protocol = secure ? 'https' : 'http';
		return {
			host: host_port[0],
			port: host_port[1] ? parseInt(host_port[1], 10) : null,
			protocol: protocol,
			secure: secure,
			url: req.url
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
			var relativeUrl = (cfg.translate? cfg.translate(reqSpec.url, reqSpec, req) : reqSpec.url);
			if (relativeUrl === null) {
				console.error('Failed to translate URL:', reqSpec.url);
				// Failed to translate, return 404 Not Found
				res.writeHead(404);
				res.end('<html><head><title>Error 404 - Page Not Found</title></head><body><h1>Error 404 - Page Not Found</h1><p>Your requested page is not found.</p></body></html>');
			} else {
				// Build Fully-qualified URL for rewrite
				var fqUrl = (cfg.protocol ? cfg.protocol : reqSpec.protocol) + "://"
					+ (cfg.host ? cfg.host : reqSpec.host)
					+ (cfg.port ? ':'+cfg.port : (cfg.host ? '' : (reqSpec.port ? ':'+reqSpec.port : '')))
					+ relativeUrl;
				if (cfg.debug) {
					console.info('URL    :', reqSpec.url);
					console.info('Origin :', fqUrl);
					console.info('');
				}
				// Proxy request to the translated URL, and pipe back the response
				req.pipe(request(fqUrl)).pipe(res);
			}
			return;
		};
	}
	
	// Default internal vhost handler
	// Lists all recognised vhosts
	function internalDefaultHandler(vhosts) {
		console.log(vhosts);
		return function(req, res) {
			var reqSpec = getRequestSpec(req);
			res.writeHead(404);
			res.write('<html><head><title>Unknown vhost</title></head>');
			res.write('<body><h1>404: Unknown vhost</h1>');
			res.write('<p>Froxy: Unrecognised vhost ' + reqSpec.host + '</p>');
			res.write('<p>');
			res.write('Do you mean:<br/>');
			vhosts.forEach(function(hostname) {
				var loc = hostname + (reqSpec.port? ':'+reqSpec.port : ''),
					url = reqSpec.protocol + '://' + loc;
				res.write('<a href="' + url + '">' + loc +'</a><br/>');
			});
			res.write('</p>');
			res.write('</body></html>');
			res.end();
		};
	}
	
	function vhost(option) {
		var vhostMap = {},
			defaultHandler;
		Object.keys(option).forEach(function(hostname) {
			var val = option[hostname],
				handler = null;
			if (val instanceof Function) {
				// handler function provided, use as is
				handler = val;
			} else if (val instanceof Object && !(val instanceof Array)) {
				// create handler from proxy config
				handler = proxy(val);
			}
			if (handler) {
				if (hostname === 'default') {
					defaultHandler = handler;
				} else {
					vhostMap[hostname] = handler;
				}
			}
		});
		if (!defaultHandler) {
			// No default vhost handler provided
			// Use internal default
			defaultHandler = internalDefaultHandler(Object.keys(vhostMap));
		}
		
		// Return the vhost dispatcher function
		return function(req, res) {
			var hostname = req.headers.host.split(':')[0];
			var handler = vhostMap[hostname];
			if (handler) {
				handler(req, res);
			} else {
				defaultHandler(req, res);
			}
		};
		
	}
	
	var _api = {
		proxy: proxy,
		vhost: vhost
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		// Running in Node.js
		module.exports = _api;
	} else {
		// We are lost
		console.error('Unknown execution environment. Giving up.');
	}
	
})();

