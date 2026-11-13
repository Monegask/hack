import {performance} from 'node:perf_hooks';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
// A durable lease also works when a Docker restart reuses PID 1.
export class Store{
 constructor(directory,{memory=false}={}){
  if(!memory)fs.mkdirSync(directory,{recursive:true,mode:0o700});
  this.db=new DatabaseSync(memory?':memory:':path.join(directory,'pvp.sqlite'));
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS commands(match_id TEXT,account TEXT,id TEXT,value TEXT NOT NULL,PRIMARY KEY(match_id,account,id));');
  this.metrics={writes:0,serializedBytes:0,writeMs:0,transactions:0,commitMs:0};
  this.commandQ=this.db.prepare('SELECT value FROM commands WHERE match_id=? AND account=? AND id=?');this.insertCommandQ=this.db.prepare('INSERT INTO commands VALUES(?,?,?,?)');
  this.getQ=this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?');this.putQ=this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value');
  if(!memory){
   this.owner=randomUUID();this.db.exec('CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY,owner TEXT,expires INTEGER)');
   const now=Date.now();this.db.exec('BEGIN IMMEDIATE');
   try{const lease=this.db.prepare('SELECT * FROM lease WHERE id=1').get();if(lease&&lease.expires>now)throw Error('Another PvP process owns DATA_DIR (crash recovery waits up to 15 seconds)');this.db.prepare('INSERT INTO lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires').run(this.owner,now+15000);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');this.db.close();throw e;}
   this.leaseTimer=setInterval(()=>{const r=this.db.prepare('UPDATE lease SET expires=? WHERE id=1 AND owner=? AND expires>?').run(Date.now()+15000,this.owner,Date.now());if(!r.changes){this.lostLease=true;clearInterval(this.leaseTimer);}},3000);this.leaseTimer.unref();
  }
 }
 assertLease(){if(!this.owner)return;const row=this.db.prepare('SELECT owner,expires FROM lease WHERE id=1').get();if(this.lostLease||row?.owner!==this.owner||row.expires<=Date.now())throw Error('Database lease lost; stop this server');}
 get(kind,id){this.assertLease();const row=this.getQ.get(kind,String(id));return row?JSON.parse(row.value):null;}
 put(kind,id,value){this.assertLease();const t=performance.now(),encoded=JSON.stringify(value);this.putQ.run(kind,String(id),encoded);this.metrics.writes++;this.metrics.serializedBytes+=Buffer.byteLength(encoded);this.metrics.writeMs+=performance.now()-t;}
 all(kind){this.assertLease();return this.db.prepare('SELECT value FROM records WHERE kind=?').all(kind).map(x=>JSON.parse(x.value));}
 remove(kind,id){this.assertLease();this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,String(id));}
 transaction(fn){
  this.assertLease();const nested=!!this.depth,savepoint='batch_'+(this.depth||0);this.depth=(this.depth||0)+1;
  try{
   this.db.exec(nested?'SAVEPOINT '+savepoint:'BEGIN IMMEDIATE');
   try{const value=fn();const t=performance.now();this.db.exec(nested?'RELEASE '+savepoint:'COMMIT');if(!nested){this.metrics.transactions++;this.metrics.commitMs+=performance.now()-t;}return value;}
   catch(e){this.db.exec(nested?'ROLLBACK TO '+savepoint:'ROLLBACK');if(nested)this.db.exec('RELEASE '+savepoint);throw e;}
  }finally{this.depth--;}
 }
 command(match,account,id){this.assertLease();const r=this.commandQ.get(match,account,id);return r?JSON.parse(r.value):null;}
 putCommand(match,account,id,value){this.assertLease();this.insertCommandQ.run(match,account,id,JSON.stringify(value));}
 close(){clearInterval(this.leaseTimer);if(this.owner)this.db.prepare('DELETE FROM lease WHERE id=1 AND owner=?').run(this.owner);this.db.close();}
}
