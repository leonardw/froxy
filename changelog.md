# Change Log - froxy

### 0.5.1, 2014-09-05
* New proxy option 'access' to limit incoming protocol access to plain, secure or any
* vhost map() renamed to reset() to avoid confusion with ECMAScript-5 map function

### 0.5.0, 2014-09-01
* Redesigned vhost API, allowing vhost mapping to be changed on-the-fly.

### 0.4.1, 2014-08-26
* Much improved stability
* Graceful error handling of problematic origin server
* Support timeout on proxy connections
* Consistent HTTP error responses

### 0.2.0, 2014-08-26
* New vhost functionality via .vhost()

### 0.1.0, 2014-07-16
* Fix variable declaration error in JS caused by typo
* Update usage example code to Express v4
* Promoted version number to reflect readiness after initial trials

### 0.0.2, 2014-07-09
First documented release