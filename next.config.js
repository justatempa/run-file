/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

import path from 'path';

/** @type {import("next").NextConfig} */
const config = {
  output: 'standalone',
  webpack: (config, { isServer }) => {
    // 禁用符号链接解析
    config.resolve.symlinks = false;

    // 限制模块搜索路径到项目目录
    const projectRoot = process.cwd();
    config.resolve.modules = [
      path.join(projectRoot, 'node_modules'),
    ];

    // 设置 resolve.roots 限制文件系统访问
    config.resolve.roots = [projectRoot];

    // 完全禁用 snapshot 功能
    config.snapshot = {
      managedPaths: [],
      immutablePaths: [],
      buildDependencies: {
        timestamp: false,
        hash: false,
      },
      module: {
        timestamp: false,
        hash: false,
      },
      resolve: {
        timestamp: false,
        hash: false,
      },
      resolveBuildDependencies: {
        timestamp: false,
        hash: false,
      },
    };

    // 禁用文件系统缓存
    config.cache = false;

    return config;
  },
};

export default config;
