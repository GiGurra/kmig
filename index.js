#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml');
const yargs = require('yargs/yargs');

async function main() {

    const conf = parseCmdLine();

    let inputYaml = await readAllStdIn();

    if (conf.s) {
        for (const fromTo of conf.s) {
            const parts = fromTo.split('=');
            if (parts.length !== 2) {
                throw new Error("-s flag must be given on the form -s from=to")
            }

            const from = parts[0];
            const to = parts[1];

            inputYaml = inputYaml.replace(new RegExp(from, 'g'), to);
        }
    }

    let doc = yaml.safeLoad(inputYaml);

    if (doc.items) {
        doc.items = doc.items.map(item => filterItem(item, conf))
    } else {
        doc = filterItem(doc, conf)
    }

    console.log(yaml.safeDump(doc, {lineWidth: -1}))

}

async function readAllStdIn() {
    let buffer = Buffer.alloc(0);
    for await (const chunk of process.stdin) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer.toString('utf8');
}

function filterItem(docIn) {

    if (!docIn) {
        return docIn
    }

    const docOut = clone(docIn);

    if (docOut.kind === "ServiceAccount") {
        delete docOut['secrets'];
    }

    if (docOut.kind === "Service") {
        delete docOut.clusterIP;
        delete docOut.clusterIPs;
    }

    if (docOut.metadata) {

        if (docOut.metadata.annotations) {
            //delete docOut.metadata.annotations['field.cattle.io/creatorId'] // needed for rancher to auto create services
            delete docOut.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
            delete docOut.metadata.annotations['pv.kubernetes.io/bind-completed'];
            delete docOut.metadata.annotations['deployment.kubernetes.io/revision'];
            delete docOut.metadata.annotations['cattle.io/status'];
            delete docOut.metadata.annotations['pv.kubernetes.io/bound-by-controller']
        }

        delete docOut.metadata.creationTimestamp;
        delete docOut.metadata.resourceVersion;
        delete docOut.metadata.selfLink;
        delete docOut.metadata.uid;
        delete docOut.metadata.ownerReferences;
        delete docOut.metadata.generation;

        if (docOut.metadata.labels) {
            //delete docOut.metadata.labels['cattle.io/creator'] // norman deserves to be left alone

            delete docOut.metadata.labels['tanka.dev/environment'];

        }
    }

    if (docOut.spec) {
        delete docOut.spec.claimRef;
        if (docOut.spec.template) {
            if (docOut.spec.template.metadata) {
                if (docOut.spec.template.metadata.annotations) {
                    delete docOut.spec.template.metadata.annotations['cattle.io/timestamp']
                }
            }
        }
    }

    delete docOut.status;

    return removeEmpty(docOut);
}

function removeEmpty(obj) {
    const newObj = {};
    Object.entries(obj).forEach(([k, v]) => {
        if (v === Object(v)) {
            const inner = removeEmpty(v);
            if (Object.keys(inner).length !== 0) {
                newObj[k] = removeEmpty(v);
            }
        } else if (v != null) {

            newObj[k] = obj[k];
        }
    });
    return newObj;
}

function clone(a) {
    return JSON.parse(JSON.stringify(a));
}

function parseCmdLine() {
    return yargs(process.argv.slice(2))
        .option('verbose', {
            alias: 'v',
            description: 'print more stuff',
            type: 'boolean',
            default: false,
        })
        .option('replace-raw', {
            alias: 's',
            description: 'raw string replacement',
            type: 'list',
        })
        .option('namespace', {
            alias: 'n',
            description: 'intelligent namespace replacement',
            type: 'string',
        })
        .option('remove-cattle', {
            alias: 'c',
            description: 'remove cattle data (from/if used rancher)',
            type: 'boolean',
            default: true
        })
        .help()
        .strict()
        .argv;
}

main().catch(error => {
    console.error(error);
    process.exit(1)
});
