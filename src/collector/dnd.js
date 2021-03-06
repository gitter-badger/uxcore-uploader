import $ from 'jquery';
import Emitter from '../emitter';
import Runtime from '../html5/runtime';
import File from '../file';

function createReader(collector) {
    let _break = false;
    function reader(dataTransfer, responders) {
        var items = dataTransfer.items,
            files = dataTransfer.files,
            item;

        for (let i = 0, l = files.length; i < l; i++) {
            if (_break) break;
            item = items && items[i];

            let entry = item && item.webkitGetAsEntry && item.webkitGetAsEntry();

            if (entry && entry.isDirectory) {
                readEntry(entry, responders);
            } else {
                if (!collector(files[i], responders)) {
                    _break = true;
                    break;
                }
            }
        }
    }
    function readEntry(entry, responders) {
        if (_break) return;
        if (entry.isFile) {
            entry.file((file) => {
                if (_break) return;
                if (!collector(file, responders)) {
                    _break = true;
                }
            });
        } else if (entry.isDirectory) {
            entry.createReader().readEntries((entries) => {
                if (_break) return;
                for (let i = 0, l = entries.length; i < l; i++) {
                    if (_break) break;
                    readEntry(entries[i], responders);
                }
            });
        }
    }
    return reader;
}

class Area extends Emitter {
    constructor(area) {
        super();

        this.areaElement = area;
    }

    contains(target) {
        return this.areaElement.contains(target);
    }

    start(e, allowed) {
        this.emit('start', e, allowed);
    }

    response(e, allowed) {
        allowed = allowed && this.contains(e.target);
        this.emit('response', e, allowed);
        return allowed;
    }

    end(e) {
        this.emit('end', e);
    }
}

const Collectors = [];

function prepare() {
    if (!('DataTransfer' in window) || !('FileList' in window)) {
        return;
    }

    const $doc = $(document),
        runtime = Runtime.getInstance();

    let started = 0, enter = 0, endTimer;
    const dataTransferReader = createReader((file, responders) => {
        if (!responders || responders.length < 1) {
            return false;
        }
        file = new File(runtime, file);
        let total = responders.length;
        return responders.some((responder) => {
            const ret = responder.recieve(file);
            if (ret > 0) {
                return true;
            }
            if (ret < 0) {
                total -= 1;
            }
            return false;
        }) || total > 0;
    });

    const start = (e) => {
        started = 1;
        Collectors.forEach((responder) => responder.start(e));
    };

    const move = (e) => {
        const has = Collectors.filter(responder => responder.response(e)).length > 0;

        const dataTransfer = (e.originalEvent || e).dataTransfer;

        if (dataTransfer) {
            dataTransfer.dropEffect = has ? 'copy' : 'none';
        }
        e.preventDefault();
    };

    const end = (e) => {
        started = 0;
        enter = 0;
        Collectors.forEach((responder) => responder.end(e));
    };

    const drag = (e) => {
        clearTimeout(endTimer);
        let isLeave = e.type === 'dragleave';
        if (!isLeave && !started) {
            start(e);
        }
        move(e);
        if (isLeave) {
            endTimer = setTimeout(() => end(e), 100);
        }
    };
    const drop = (e) => {
        e.preventDefault();

        clearTimeout(endTimer);
        end(e);

        const responders = Collectors.filter((responder) => responder.contains(e.target));

        if (responders.length < 1) {
            return;
        }

        let dataTransfer = (e.originalEvent || e).dataTransfer;

        try {
            if (dataTransfer.getData('text/html')) {
                return;
            }
        } catch (ex) {}

        dataTransferReader(dataTransfer, responders);
    };

    $doc.on('dragenter dragover dragleave', drag);
    $doc.on('drop', drop);
}

export default class DndCollector {

    constructor(context) {
        if (Collectors.length < 1) {
            prepare();
        }
        Collectors.push(this);

        this.context = context;
        this.areas = [];
    }

    addArea(area) {
        area = new Area(area);
        this.areas.push(area);
        area.destroy = () => {
            area.removeAllListeners();
            let i = this.areas.indexOf(area);
            if (i > -1) {
                this.areas.splice(i, 1);
            }
        };

        return area;
    }

    contains(target) {
        return this.areas.some((area) => area.contains(target));
    }

    start(e) {
        this.areas.forEach((area) => area.start(e));
    }

    response(e) {
        return this.areas.map((area) => area.response(e)).some(r => r !== false);
    }

    recieve(file) {
        const ret = this.context.add(file);
        if (ret > 0 && !this.context.isMultiple()) {
            return -1;
        } else {
            return ret;
        }
    }

    end(e) {
        this.areas.forEach((area) => area.end(e));
    }
}
