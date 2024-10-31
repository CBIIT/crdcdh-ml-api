const axios = require('axios');
const yaml = require('js-yaml');
const { CDE_TERM, ALLOWED_VALUES, DEF_VERSION} = require('./constants');
const config = require('../config');
const YML_FILE_EXT = ["yml", "yaml"];
const DEF_MODEL_PROP_FILE = "prop-file";
const DEF_MODEL_FILES = "model-files";
const PROP_DEFINITIONS = 'PropDefinitions';
const PROP_TYPE = 'Type';
const PROP_ENUM = 'Enum';
const VALUE_TYPE = 'value_type';

const prop_list_types = [
    "value-list", // value_type: list, e.g, "value1,value2,value3" represents a value list
    "list" // value_type: list, e.g, "value1*value2*value3" represents an array [value1, value2, value3]
];

class TermReader {
    constructor(webClient) {
        this.cdes = null;
        this.models_props = null;
        // get models definition file
        this.models_def_file_path = config.model_url;
        this.model_def_dir = this.models_def_file_path.substring(0, this.models_def_file_path.lastIndexOf('/'));
        this.models_def;
        this.webClient = webClient;
    }

    async init() {
        let msg = null;
        this.models_def = await this.webClient.downloadFileToDict(this.models_def_file_path);
        if (typeof this.models_def !== 'object') {
            msg = `Invalid models definition at "${this.models_def_file_path}"!`;
            console.error(msg);
            throw new Error(msg);
        }

        this.cdes = {};
        // get property's permissive values and term.
        for (const [key, v] of Object.entries(this.models_def)) {
            const data_common = key;
            const versions = v[DEF_VERSION];
            for( const version of versions) {
                await this.create_model(data_common, version)
            }   
        }
    }

    /**
     * Create a CDE term dict by parsing yaml model property file
     */
    async create_model(data_common, version) {
        const dc = data_common;
        const v = this.models_def[dc];
        // const model_dir = this.model_def_dir + "/" + path.join(dc, version);
        // const props_file_name = `${this.model_def_dir.trim()}/${dc.trim()}/${version.trim()}/${v[DEF_MODEL_PROP_FILE].trim()}`;
        const model_dir = `${this.model_def_dir.trim()}/${dc.trim()}/${version.trim()}`;
        //process model files for the data common
        const file_names =  v[DEF_MODEL_FILES].map(file => `${model_dir}/${file.trim()}`);
        try{
            const [result, properties_term, msg] = await parse_model_props(file_names, this.webClient);
            if (!result) {
                console.error(msg);
                return;
            }
            this.cdes[model_key(data_common, version)] = properties_term;
        } catch (e) {
            console.error(`Failed to create data model: ${data_common}/${version}!`);
        }
    }

    get_term_by_property_name(datacommon, version, prop_name){
        const model = this.cdes[model_key(datacommon, version)];
        return (model) ? model[prop_name] : null;
    }
}


/**
 * Parse model property file
 */
async function parse_model_props(model_props_files, webClient) {
    let properties = {};
    let permissive_value_dic = {};
    let msg = null;

    try {
        for(const model_props_file of model_props_files) {
            console.info(`Reading prop file: ${model_props_file} ...`);
            if (model_props_file && model_props_file.includes('.') && YML_FILE_EXT.includes(model_props_file.split('.').pop().toLowerCase())) {
                const props = await webClient.downloadFileToDict(model_props_file);
                if (!props) {
                    msg = `Invalid model properties file: ${model_props_file}!`;
                    console.error(msg);
                    return [false, null, msg];
                }
                if (props[PROP_DEFINITIONS])
                {
                    // Object.assign(properties, props[PROP_DEFINITIONS]);
                    properties = {...properties, ...props[PROP_DEFINITIONS]}; // merge all properties
                }
            }
        }
        
    } catch (e) {
        console.error(`Failed to read yaml file to dict: ${model_props_files}!`);
        throw e;
    }
    let permissive_value;
    for (const [prop_name, prop] of Object.entries(properties)) {
        if (prop[PROP_ENUM]) {
            permissive_value = {};
            permissive_value[CDE_TERM] = (prop[CDE_TERM] && prop[CDE_TERM].length > 0)? prop[CDE_TERM][0] : null;
            permissive_value[ALLOWED_VALUES] = get_permissive_values(prop[PROP_ENUM])
        } else if (prop[PROP_TYPE] && typeof prop[PROP_TYPE] === 'object' && prop[PROP_TYPE][VALUE_TYPE] && prop_list_types.includes(prop[PROP_TYPE][VALUE_TYPE]) && prop[PROP_TYPE][PROP_ENUM]) {
            permissive_value = {};
            permissive_value[CDE_TERM] = (prop[CDE_TERM] && prop[CDE_TERM].length > 0)? prop[CDE_TERM][0] : null;
            permissive_value[ALLOWED_VALUES] = get_permissive_values(prop[PROP_TYPE][PROP_ENUM])
        } else {
            continue;
        }

        if (permissive_value && permissive_value[ALLOWED_VALUES].length > 0) {
            permissive_value_dic[prop_name] = permissive_value
        } else {
            msg = `No term for the property: ${prop_name}!`;
        }
    }
    return [true, permissive_value_dic, msg];
}

function get_permissive_values(enum_value){
    let permissive_values = null;
    if (enum_value && enum_value.length > 0) {
        permissive_values = _get_item_type(enum_value);
    }
    return permissive_values 
}

const _get_item_type = (prop_enum) => {
    const enumSet = new Set();
    const urlPattern = /:\/\//;

    for (const t of prop_enum) {
        if (!urlPattern.test(t)) {
            enumSet.add(t);
        }
    }

    if (enumSet.size > 0) {
        return Array.from(enumSet);
    } else {
        return null;
    }
};

const model_key = (data_common, version) => {
    return `${data_common}_${version}`
}
    

module.exports = {
    TermReader
};