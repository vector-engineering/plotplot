
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    app.use(
        '/plotplot/api',
        createProxyMiddleware({
            target: 'https://127.0.0.1:5000',
            changeOrigin: true,
            secure: false,
            pathRewrite: { '^/plotplot/api': '/api' },
            logLevel: 'debug'
        })
    );

    app.use(
        '/plotplot/login',
        createProxyMiddleware({
            target: 'https://127.0.0.1:5000',
            changeOrigin: true,
            secure: false,
            pathRewrite: { '^/plotplot/login': '/login' },
            logLevel: 'debug'
        })
    );

    app.use(
        '/plotplot/logout',
        createProxyMiddleware({
            target: 'https://127.0.0.1:5000',
            changeOrigin: true,
            secure: false,
            pathRewrite: { '^/plotplot/logout': '/logout' },
            logLevel: 'debug'
        })
    );

};
