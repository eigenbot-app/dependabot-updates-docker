import * as core from "@actions/core";
import {globby} from "globby";
import YAML, {YAMLMap, YAMLSeq} from "yaml";
import * as fs from "fs";
import path from "path";

void safeRun();

async function safeRun(): Promise<void> {
    run()
        .then((res) => {
            if (res instanceof Error) {
                core.setFailed(res.message);
            }
        })
        .catch((err) => {
            core.setFailed(`internal error: ${err.message}`);
        });
}

const cfgFile = ".github/dependabot.yml";

const ecosystemDocker = "docker";
const keyContents = "updates";
const keyDirectory = "directory";
const keyEcosystem = "package-ecosystem";
const keySchedule = "schedule";
const keyVersion = "version";

const keyInterval = "interval";
const interval = core.getInput("interval");

function addUpdateEntry(updates: YAML.YAMLSeq) {
    return (dir: string) => {
        const schedule = new YAMLMap<string, string>();
        schedule.set(keyInterval, interval);

        const map = new YAML.YAMLMap<string, string | YAMLMap>();
        map.set(keyDirectory, dir);
        map.set(keyEcosystem, ecosystemDocker);
        map.set(keySchedule, schedule);
        updates.items.push(map);

        core.info(`Added Dependabot entry for Dockerfile in ${dir}.`);
    };
}

function write(doc: YAMLMap<unknown, unknown>) {
    fs.writeFileSync(cfgFile, YAML.stringify(doc, {collectionStyle: "block"}));
}

async function run(): Promise<null | Error> {
    const paths = await globby(["**/Dockerfile", "!**/vendor/**/Dockerfile"], {
        gitignore: true,
    });

    if (paths.length == 0) {
        core.info("No Dockerfiles found.");
        return null;
    }

    const dirNames = paths.map((p) => path.dirname(p));
    const dockerDirs = new Set(dirNames);

    if (fs.existsSync(cfgFile)) {
        const bs = fs.readFileSync(cfgFile, "utf8");
        const doc = YAML.parseDocument(bs);
        const contents = doc.contents as YAML.YAMLMap;
        const updates = contents.get(keyContents) as YAML.YAMLSeq;

        for (const i in updates.items) {
            const update = updates.items[i] as YAMLMap;
            if (update.get(keyEcosystem) !== ecosystemDocker) {
                continue;
            }
            dockerDirs.delete(update.get(keyDirectory) as string);
        }

        dockerDirs.forEach(addUpdateEntry(updates));
        fs.writeFileSync(
            cfgFile,
            YAML.stringify(doc, {collectionStyle: "block"})
        );
    } else {
        const updates = new YAMLSeq();
        dockerDirs.forEach(addUpdateEntry(updates));

        const doc = new YAMLMap();
        doc.set(keyVersion, 2);
        doc.set(keyContents, updates);
        write(doc);
    }
    return null;
}
