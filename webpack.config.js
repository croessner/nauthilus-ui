export const module = {
    rules: [
        {
            test: /\.tsx?$/,
            enforce: 'pre',
            use: ['source-map-loader'],
        }
    ]
};

export const resolve = {
    fallback: {
        "crypto": false
    }
};
