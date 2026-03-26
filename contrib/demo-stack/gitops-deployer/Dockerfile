FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.mod ./
COPY *.go ./

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gitops-deployer .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates git openssh-client

COPY --from=build /out/gitops-deployer /usr/local/bin/gitops-deployer

ENTRYPOINT ["gitops-deployer"]
