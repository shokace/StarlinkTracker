const path = require("path");
const { defineConfig } = require("@meteorjs/rspack");

module.exports = defineConfig((Meteor) => {
  return {
    module: {
      rules: [
        {
          test: /\.svg$/i,
          issuer: /\.[jt]sx?$/,
          use: ["@svgr/webpack"],
        },
      ],
    },
    resolve: {
      alias: {
        "@zip.js/zip.js/lib/zip-no-worker.js": path.resolve(
          __dirname,
          "node_modules/@zip.js/zip.js/index.js",
        ),
      },
      fallback: {
        fs: false,
      },
    },
  };
});
