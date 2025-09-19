// docker-bake.hcl
// Configuration file for Docker Buildx multi-architecture builds

// Default target to build
group "default" {
  targets = ["nauthilus-ui"]
}

// Target for the main application
target "nauthilus-ui" {
  context = "."
  dockerfile = "Dockerfile"
  platforms = [
    "linux/amd64",
    "linux/arm64",
    "linux/arm/v7",
    "linux/arm/v6",
  ]
  // Uncomment and modify the following line to set a tag for your image
  // tags = ["your-registry/nauthilus-ui:latest"]
}
