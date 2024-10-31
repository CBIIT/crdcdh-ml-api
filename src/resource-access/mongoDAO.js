const MongoClient = require('mongodb').MongoClient;

const {CDE_COLLECTION, CDE_CODE, CDE_VERSION, SYNONYM_COLLECTION} = require("../common/constants")

class MongoDAO {
    constructor(connectionString, dbName) {
        this.connectionString = connectionString;
        this.client = null;
        this.dbName = dbName;
    }
    /**
     * connect
     * @returns 
     */
    async connect() {
        try {
            this.client = new MongoClient(this.connectionString, { useNewUrlParser: true, useUnifiedTopology: true });
            await this.client.connect();
            console.info('Connected to MongoDB');
        } catch (err) {
            console.error('Error connecting to MongoDB:', err);
        }
        return this.client;
    }
    /**
     * disconnect
     */
    async disconnect() {
        try {
            if (this.client) {
                await this.client.close();
                console.info('Disconnected from MongoDB');
            }
        } catch (err) {
            console.error('Error disconnecting from MongoDB:', err);
        }
    }
    /**
     * getCDEPermissibleValues
     * @param {*} cdeCode 
     * @param {*} cdeVersion 
     * @returns 
     */
    async getCDEPermissibleValues(cdeCode, cdeVersion) {
        const db = this.client.db(this.dbName);
        const dataCollection = db.collection(CDE_COLLECTION);
        let query = {"CDECode": cdeCode};
        if (cdeVersion)
            query["CDEVersion"] = cdeVersion;

        try {
            // Find the CDE document based on code and version, if version is null return last version.
            const cdeData = await dataCollection.findOne(query, {"CDEVersion": -1});
            // Log an error if no data is found
            if (!cdeData) {
                console.error(`No permissible values found for CDE code ${cdeCode} with version ${cdeVersion}`);
            }
            return cdeData;
        } catch (err) {
            if (err.name === 'MongoError') {
                // Handle any MongoDB-related errors
                console.error(`MongoDB error while retrieving CDE permissible values for ${cdeCode}/${cdeVersion}: ${err}`);
            } else {
                // Handle general exceptions
                console.error(`Unexpected error retrieving permissible values for ${cdeCode}/${cdeVersion}: ${err}`);
            }
            return null;
        }
    }
    /**
     * find_synonyms
     * @param {*} word 
     * @returns 
     */
    async findSynonyms(word) {
        const db = this.client.db(this.dbName);
        const synonymsCollection = db.collection(SYNONYM_COLLECTION);
        try {
            // find one synonym with the input word in case-insensitive
            return await synonymsCollection.find({ "synonym_term": word }, { "collation": { "locale": "en", strength: 1 }}).toArray();
        } catch (err) {
            console.error(`Error finding synonyms for ${word}: ${err}`);
            return null;
        }
    }
}

async function MongoDBHealthCheck(connectionString){
    const connection = new DatabaseConnector(connectionString)
    try{
        await connection.connect()
        await connection.client.db("admin").command({ ping: 1 });
        console.info("MongoDB health check passed");
        return true
    }
    catch (err){
        console.error("MongoDB health check failed");
    }
    finally {
        await connection.disconnect();
    }
    return false;
}

module.exports = {
    MongoDAO, 
    MongoDBHealthCheck
};