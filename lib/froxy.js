/*!
 * Froxy
 * Copyright (c) 2014 Leonard Wu <leonard.wu92@alumni.ic.ac.uk>
 * https://github.com/leonardw/froxy
 * MIT Licensed
 */
(function () {
	var request = require('request'),
		http = require('http'),
		util = require('util');
	
	var PKG = require('../package.json').name,
		VER = require('../package.json').version;
	
	var HTTP = {
		NOT_FOUND: 404,
		INTERNAL_SERVER_ERROR: 500,
		BAD_GATEWAY: 502,
		SERVICE_UNAVAILABLE: 503,
		GATEWAY_TIMEOUT: 504
	};
	
	var DEFAULT_HTTP_TIMEOUT = 1000 * 60 * 5; //in millisec; 5 min, reference Apache mod_proxy
	
	function getTranslateFn(translateParam) {
		if (translateParam instanceof Function) {
			// param is already a function, return as is
			return translateParam;
		} else if (util.isArray(translateParam)) {
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
	
	function sendResponse(res, status, msgOrCallbk) {
		if (res) {
			var description = http.STATUS_CODES[status];
			if (description === undefined) {
				// unrecognised HTTP code, fallback to defaults
				description = 'Unrecognised HTTP status';
			}
			res.writeHead(status);
			res.write('<html><head><title>' + PKG + ': ' + description + '</title></head><body>');
			res.write('<div style="background-color:#3399FF; color:#FFFFFF; text-align:right; padding:5px 20px;">');
			res.write(PKG + ' v' + VER);
			res.write('</div>');
			res.write('<h1>' + status + ' - ' + description + '</h1>');
			if (msgOrCallbk) {
				if (msgOrCallbk instanceof Function) {
					// we have a callback, call it now with response obj
					msgOrCallbk(res);
				} else {
					// it's a message
					res.write('<p>' + msgOrCallbk + '</p>');
				}
			}
			res.write('</body></html>');
			res.end();
		} else {
			console.error('Unable to send HTTP response - invalid response object');
		}
	}

	// Given config options, creates a handler for proxying requests
	function proxy(option) {
		// Set defaults
		var cfg = {
			host: option.host || null,
			port: option.port || null,
			protocol: option.protocol || null,
			translate: getTranslateFn(option.translate),
			timeout: option.timeout || DEFAULT_HTTP_TIMEOUT,
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
				sendResponse(res, HTTP.NOT_FOUND);
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
				req.pipe(request(
					{
						url:fqUrl,
						timeout:cfg.timeout
					},
					function(rErr, httpMsg, rBody){
						if (rErr) {
							if (rErr.code === 'ECONNREFUSED'){
								console.error('%s: Connection refused by host', PKG, fqUrl);
								sendResponse(res, HTTP.SERVICE_UNAVAILABLE);
							} else if (rErr.code === 'ECONNRESET'){
								console.error('%s: Connection reset by host', PKG, fqUrl);
								sendResponse(res, HTTP.BAD_GATEWAY);
							} else if (rErr.code === 'ETIMEDOUT'){
								console.error('%s: Connection timeout while trying host', PKG, fqUrl);
								sendResponse(res, HTTP.GATEWAY_TIMEOUT);
							} else {
								console.error('%s: Internal server error %s: %s while connecting to', PKG, rErr.code, rErr, fqUrl);
								sendResponse(res, HTTP.INTERNAL_SERVER_ERROR);
							}
						}
					}
				)).pipe(res);
			}
			return;
		};
	}
	
	// Default internal vhost handler
	// Lists all recognised vhosts
	function vhostListingHandler(vhosts) {
		return function(req, res) {
			var reqSpec = getRequestSpec(req);
			sendResponse(res, HTTP.NOT_FOUND, function(res){
				res.write('<p>Unrecognised vhost: ' + reqSpec.host + '</p>');
				res.write('<p>');
				res.write('Do you mean:<br/>');
				vhosts.forEach(function(hostname) {
					var loc = hostname + (reqSpec.port? ':'+reqSpec.port : ''),
						url = reqSpec.protocol + '://' + loc;
					res.write('<a href="' + url + '">' + loc +'</a><br/>');
				});
				res.write('</p>');
			});
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
			} else if (val instanceof Object && !util.isArray(val)) {
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
			defaultHandler = vhostListingHandler(Object.keys(vhostMap));
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
