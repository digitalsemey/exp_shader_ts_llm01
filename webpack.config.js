const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(vert|frag)$/,
        use: 'raw-loader',
      },
      {
        test: /\.worker\.ts$/, // Or just /\.ts$/, but specific to worker files
        use: {
          loader: 'worker-loader',
          options: {
            filename: '[name].js', // Or a hash for cache busting
            inline: 'fallback' // For older browsers or specific environments
          }
        }
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    static: './dist',
  },
};