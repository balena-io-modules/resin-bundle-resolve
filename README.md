# Resin-bundle-resolve

Resolve resin bundles into a format recognised by the docker daemon.
`resin-bundle-resolve` is written in typescript.

## What is a resin bundle?
A resin bundle is a tar archive which contains a type of
Dockerfile and metadata used to create a Dockerfile proper, 
which docker can understand.

## Which bundles are supported

Currently default resolvers included are;
* Dockerfile.template
   * Resolve template variables with metadata, currently supported:
       * `%%RESIN_MACHINE_NAME%%`
       * `%%RESIN_ARCH%%`
       * `%%BALENA_MACHINE_NAME%%`
       * `%%BALENA_ARCH%%`
* Architecture Specific Dockerfiles
   * Choose the correct Dockerfile for a given build architecture or device type
* Standard Dockerfile projects

## How do I add a resolver?
`resin-bundle-resolver` supports the adding of generic resolvers, by 
implementing the `resolver.d.ts` interface in `./src`. Examples of this
can be found in the `src/resolvers/` directory.

Your resolvers can then be passed to the `resolveBundle` function.

## What is the input and output?
`resin-bundle-resolver` takes a tar stream and outputs a tar stream,
which can be passed to the docker daemon or further processed.
