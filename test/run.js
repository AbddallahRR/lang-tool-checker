const esbuild = require("esbuild");
esbuild
	.build({
		entryPoints: ["test/check.test.ts"],
		bundle: true,
		platform: "node",
		format: "cjs",
		outfile: ".test/check.bundle.cjs",
	})
	.then(() => {
		require("../.test/check.bundle.cjs");
	})
	.catch((e) => {
		console.error(e.message);
		process.exit(1);
	});
