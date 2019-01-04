import "ethers/dist/shims.js";
// Note: ethers SHOULD be imported from their main object
// shims aren't injected with package import
import { ethers } from "ethers";

class Utils {
  static isAddress = address => {
    return typeof address === "string" && address.match(/^0x[0-9A-Fa-f]{40}$/);
  };

  static isABI = abi => {
    return abi && Array.isArray(abi);
  };

  // https://github.com/ethers-io/ethers.js/blob/db383a3121bb8cf5c80c5488e853101d8c1df353/src.ts/utils/properties.ts#L20
  static isEthersJsSigner = signer => {
    return signer && signer._ethersType === "Signer";
  };
}

// Tech debt:
// For now we are assuming that a TransactionSubscription has maxListeners = 1
// To avoid the wheel reinventing, maybe using NodeJS EventEmitter object could be a way to go
class TransactionSubscription {
  #txPromise;
  #provider;
  #tx;
  #timeout = 2000;
  #listeners = [];
  #errorListener;

  constructor(txPromise, provider) {
    this.#txPromise = txPromise;
    this.#provider = provider;
  }

  on = async (trigger, callback) => {
    const triggers = ["confirmation", "failed"];

    if (!triggers.includes(trigger)) {
      throw new Error(`Invalid listener trigger, use: [${triggers}]`);
    }

    if (!callback || typeof callback !== "function") {
      throw new Error(`Cannot listening without a function`);
    }

    if (trigger === "failed") {
      this.#addErrorListener(callback);
    } else {
      this.#addListener(trigger, callback);
    }
  };

  hasListener = () => {
    return this.#listeners.length > 0;
  };

  removeListener = () => {
    if (this.hasListener()) {
      const listener = this.#listeners.pop();
      const { eventName, listenerFunction } = listener;
      this.#provider.removeListener(eventName, listenerFunction);
    }
  };

  removeAllListeners = () => {
    this.removeListener();
  };

  off = () => {
    this.removeListener();
  };

  unsubscribe = () => {
    this.removeListener();
  };

  #addErrorListener = callback => {
    this.#errorListener = callback;
  };

  #addListener = async (trigger, callback) => {
    if (this.hasListener()) {
      throw new Error(`Subscription already listening`);
    }

    this.#tx = await this.#txPromise;

    const emitterFunction = async receipt => {
      const { confirmations } = receipt;
      const message = {
        data: {
          confirmations: confirmations,
        },
      };

      try {
        await callback(message);
      } catch (error) {
        this.#emitErrorEvent(
          new Error(`Callback function with error: ${error.message}`)
        );
      }
    };

    const receipt = await this.#provider.getTransactionReceipt(this.#tx.hash);
    const alreadyMined = receipt != null;

    if (alreadyMined) {
      this.#listeners.push({
        eventName: "block",
        listenerFunction: async () => {
          const receipt = await this.#provider.getTransactionReceipt(
            this.#tx.hash
          );
          emitterFunction(receipt);
        },
      });
    } else {
      this.#listeners.push({
        eventName: this.#tx.hash,
        listenerFunction: emitterFunction,
      });
    }

    const { eventName, listenerFunction } = this.#listeners[
      this.#listeners.length - 1
    ];
    this.#provider.on(eventName, listenerFunction);

    setTimeout(() => {
      this.removeListener();
      this.#emitErrorEvent(new Error(`Listener removed after reached timeout`));
    }, this.#timeout);
  };

  #emitErrorEvent = error => {
    if (this.#errorListener) {
      this.#errorListener(error);
    }
  };

  // Tech debt
  // This method avoid duplicated nonce generation when rapid succession of several transactions
  // See: https://github.com/ethereumbook/ethereumbook/blob/04f66ae45cd9405cce04a088556144be11979699/06transactions.asciidoc#keeping-track-of-nonces
  // How we'll should keeping track of nonces?
  waitForMessage = async () => {
    const tx = await this.#txPromise;
    await this.#provider.waitForTransaction(tx.hash);
  };
}

class EventSubscription {
  #eventNames;
  #provider;

  constructor(eventNames, provider) {
    this.#eventNames = eventNames;
    this.#provider = provider;
  }

  on = (eventName, callback) => {
    if (!this.#eventNames.includes(eventName))
      throw new Error(
        `This subscription isn't subscribed on '${eventName}' event.`
      );
  };

  //removeAllListeners = async () => {};
}

export class Contract {
  #provider;
  #contract;

  constructor(address, abi, wallet) {
    this.#provider = this.#getDefaultProvider();
    this.#initializeContract(address, abi, wallet);
  }

  // Note: For now, `tasit-account` creates a ethers.js wallet object
  // In future, maybe this method could be renamed to setAccount()
  setWallet = wallet => {
    if (!Utils.isEthersJsSigner(wallet))
      throw new Error(`Cannot set an invalid wallet to a Contract`);

    this.#initializeContract(
      this.#contract.address,
      this.#contract.interface.abi,
      wallet
    );
  };

  removeWallet = () => {
    this.#initializeContract(
      this.#contract.address,
      this.#contract.interface.abi
    );
  };

  getAddress = () => {
    return this.#contract.address;
  };

  // For testing purposes
  getProvider = () => {
    return this.#provider;
  };

  subscribe = eventNames => {
    eventNames.forEach(eventName => {
      if (this.#contract.interface.events[eventName] === undefined)
        throw new Error(`Event '${eventName}' not found.`);
    });

    const subscription = new EventSubscription(eventNames, this.#provider);
    return subscription;
  };

  // Notes:
  // - Ethers.js localhost JsonRpcProvider will only be used for testing purpose;
  // - Default provider should be customized (.env file).
  #getDefaultProvider = () => {
    const provider = new ethers.providers.JsonRpcProvider();
    provider.pollingInterval = 50;
    return provider;
  };

  #initializeContract = (address, abi, wallet) => {
    if (!Utils.isAddress(address) || !Utils.isABI(abi))
      throw new Error(`Cannot create a Contract without a address and ABI`);

    if (wallet && !Utils.isEthersJsSigner(wallet))
      throw new Error(`Cannot set an invalid wallet to a Contract`);

    // If there's a wallet, connect it with provider otherwise uses provider directly (for read operations only)
    const signerOrProvider = wallet
      ? wallet.connect(this.#provider)
      : this.#provider;

    this.#contract = new ethers.Contract(address, abi, signerOrProvider);
    this.#addFunctionsToContract();
  };

  #addFunctionsToContract = () => {
    this.#contract.interface.abi
      .filter(json => {
        return json.type === "function";
      })
      .forEach(f => {
        var isWrite = f.stateMutability !== "view";
        if (isWrite) this.#attachWriteFunction(f);
        else {
          this.#attachReadFunction(f);
        }
      });
  };

  #attachReadFunction = f => {
    this[f.name] = async (...args) => {
      const value = await this.#contract[f.name].apply(null, args);
      return value;
    };
  };

  #attachWriteFunction = f => {
    this[f.name] = (...args) => {
      if (!Utils.isEthersJsSigner(this.#contract.signer))
        throw new Error(`Cannot write data to a Contract without a wallet`);

      const tx = this.#contract[f.name].apply(null, args);
      const subscription = new TransactionSubscription(tx, this.#provider);
      return subscription;
    };
  };
}

export const TasitAction = {
  Contract,
};

export default TasitAction;
