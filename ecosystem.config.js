module.exports = {
  apps: [
    {
      name: "ocp-pointage",
      cwd: "C:\\ocpdahsboard",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
    },
  ],
};