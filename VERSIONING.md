# Versioning with Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing packages. Changesets provides a way to manage versioning and changelogs for monorepos.

## Configuration

The project is configured to use fixed versioning across all packages. This means that when one package's version is bumped, all packages will be bumped to the same version. This is configured in the `.changeset/config.json` file.

## Available Scripts

The following scripts are available for managing versions:

- `npm run changeset`: Create a new changeset
- `npm run version`: Apply the changesets and update package versions
- `npm run publish`: Publish the packages to a registry

## Workflow

### Creating a Changeset

To create a changeset, run:

```bash
npm run changeset
```

This will prompt you to select the packages that have changed, the type of change (major, minor, patch), and a description of the change.

Alternatively, you can use the shorthand commands to create a specific type of changeset:

```bash
npm run major  # For major version changes
npm run minor  # For minor version changes
npm run patch  # For patch version changes
```

### Applying Changesets

Once you have created one or more changesets, you can apply them to update the package versions:

```bash
npm run version
```

This will:
1. Read all changesets
2. Update package versions according to the changesets
3. Update changelogs
4. Remove the applied changesets

### Publishing Packages

After applying the changesets and updating the versions, you can publish the packages:

```bash
npm run publish
```

This will publish all packages that have been updated to the configured registry.

## Semver

This project follows [Semantic Versioning](https://semver.org/) (semver) for version increments:

- **Major** (`X.y.z`): Breaking changes that require updates to consuming code
- **Minor** (`x.Y.z`): New features added in a backward-compatible manner
- **Patch** (`x.y.Z`): Backward-compatible bug fixes

Use the appropriate version increment based on the nature of your changes.