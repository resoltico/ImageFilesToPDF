# syntax=docker/dockerfile:1
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-tools=8.16.1-1+deb13u2 libheif-plugin-x265 libheif-plugin-libde265 libheif-plugin-aomenc libheif-plugin-dav1d \
    qpdf poppler-utils python3 xz-utils && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:8625744a60b5f008183822e194a376ea920a3df67f283f8f1afb1677a36d0101 \
    https://github.com/pdfcpu/pdfcpu/releases/download/v0.16.4/pdfcpu_0.16.4_Linux_arm64.tar.xz /tmp/pdfcpu.tar.xz
RUN tar -xJf /tmp/pdfcpu.tar.xz -C /usr/local/bin --strip-components=1 \
    pdfcpu_0.16.4_Linux_arm64/pdfcpu && rm /tmp/pdfcpu.tar.xz
