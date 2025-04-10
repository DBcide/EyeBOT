module.exports = {
    apps: [
      {
        name: "EyeBOT",
        script: "app.js",
        exec_mode: "fork",
        watch: false,
        kill_timout: 330000,
        instances: 1,
        node_args: "--max-old-space-size=1024",
        env: {
          NODE_ENV: "production"
        }
      }
    ]
  };