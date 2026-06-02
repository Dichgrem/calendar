FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV ANDROID_HOME=/android-sdk
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip git openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

RUN mkdir -p $ANDROID_HOME/cmdline-tools \
    && curl -sSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/sdk.zip \
    && unzip -q /tmp/sdk.zip -d $ANDROID_HOME/cmdline-tools \
    && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
    && rm /tmp/sdk.zip

RUN yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME \
    "platforms;android-34" "build-tools;34.0.0" "ndk;26.1.10909125"

WORKDIR /app

COPY packages/mobile/package.json ./

RUN npm install

COPY packages/mobile/ ./

WORKDIR /app
RUN echo "sdk.dir=$ANDROID_HOME" > android/local.properties \
    && chmod +x android/gradlew \
    && android/gradlew assembleRelease --no-daemon -p android \
    && mkdir /apk && cp android/app/build/outputs/apk/release/app-release.apk /apk/
