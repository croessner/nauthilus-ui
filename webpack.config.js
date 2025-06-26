export const module = {
    rules: [
        {
            test: /\.tsx?$/,
            enforce: 'pre',
            use: ['source-map-loader'],
        }
    ]
};
