// App.js
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

// ABI контрактов (упрощенные версии)
const MARKETPLACE_ABI = [
  "function listItem(address nftContract, uint256 tokenId, uint256 price)",
  "function buyItem(address nftContract, uint256 tokenId) payable",
  "function cancelListing(address nftContract, uint256 tokenId)",
  "function listings(address, uint256) view returns (uint256 price, address seller, bool isActive)",
  "event ItemListed(address indexed nftContract, uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event ItemSold(address indexed nftContract, uint256 indexed tokenId, address indexed buyer, address seller, uint256 price)"
];

const NFT_ABI = [
  "function approve(address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
];

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [marketplace, setMarketplace] = useState(null);
  const [nftContract, setNftContract] = useState(null);
  const [listings, setListings] = useState([]);
  const [myNFTs, setMyNFTs] = useState([]);

  // Адреса контрактов (замените на ваши)
  const MARKETPLACE_ADDRESS = "0x...";
  const NFT_CONTRACT_ADDRESS = "0x...";

  // Подключение к MetaMask
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const account = await signer.getAddress();
        
        setProvider(provider);
        setSigner(signer);
        setAccount(account);
        
        // Инициализация контрактов
        const marketplaceContract = new ethers.Contract(
          MARKETPLACE_ADDRESS,
          MARKETPLACE_ABI,
          signer
        );
        const nftContract = new ethers.Contract(
          NFT_CONTRACT_ADDRESS,
          NFT_ABI,
          signer
        );
        
        setMarketplace(marketplaceContract);
        setNftContract(nftContract);
        
      } catch (error) {
        console.error("Ошибка подключения:", error);
      }
    } else {
      alert("Установите MetaMask!");
    }
  };

  // Загрузка NFT пользователя
  const loadMyNFTs = async () => {
    if (!nftContract || !account) return;
    
    try {
      const balance = await nftContract.balanceOf(account);
      const nfts = [];
      
      for (let i = 0; i < balance; i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(account, i);
        const tokenURI = await nftContract.tokenURI(tokenId);
        
        nfts.push({
          tokenId: tokenId.toString(),
          tokenURI,
          owner: account
        });
      }
      
      setMyNFTs(nfts);
    } catch (error) {
      console.error("Ошибка загрузки NFT:", error);
    }
  };

  // Выставить NFT на продажу
  const listNFT = async (tokenId, price) => {
    if (!marketplace || !nftContract) return;
    
    try {
      // Сначала одобряем маркетплейс
      const approveTx = await nftContract.approve(MARKETPLACE_ADDRESS, tokenId);
      await approveTx.wait();
      
      // Выставляем на продажу
      const priceInWei = ethers.utils.parseEther(price.toString());
      const listTx = await marketplace.listItem(
        NFT_CONTRACT_ADDRESS,
        tokenId,
        priceInWei
      );
      await listTx.wait();
      
      alert("NFT успешно выставлен на продажу!");
      loadListings();
    } catch (error) {
      console.error("Ошибка листинга:", error);
    }
  };

  // Купить NFT
  const buyNFT = async (tokenId, price) => {
    if (!marketplace) return;
    
    try {
      const tx = await marketplace.buyItem(NFT_CONTRACT_ADDRESS, tokenId, {
        value: price
      });
      await tx.wait();
      
      alert("NFT успешно куплен!");
      loadListings();
      loadMyNFTs();
    } catch (error) {
      console.error("Ошибка покупки:", error);
    }
  };

  // Загрузка активных листингов
  const loadListings = async () => {
    if (!marketplace || !provider) return;
    
    try {
      // Получаем события ItemListed
      const filter = marketplace.filters.ItemListed();
      const events = await marketplace.queryFilter(filter);
      
      const activeListings = [];
      
      for (const event of events) {
        const { nftContract, tokenId, seller, price } = event.args;
        
        // Проверяем, активен ли листинг
        const listing = await marketplace.listings(nftContract, tokenId);
        
        if (listing.isActive) {
          const tokenURI = await nftContract.tokenURI(tokenId);
          
          activeListings.push({
            tokenId: tokenId.toString(),
            seller,
            price,
            tokenURI
          });
        }
      }
      
      setListings(activeListings);
    } catch (error) {
      console.error("Ошибка загрузки листингов:", error);
    }
  };

  useEffect(() => {
    if (marketplace && nftContract) {
      loadListings();
      loadMyNFTs();
    }
  }, [marketplace, nftContract]);

  return (
    <div className="App">
      <header>
        <h1>NFT Marketplace</h1>
        {!account ? (
          <button onClick={connectWallet}>Подключить кошелек</button>
        ) : (
          <p>Подключен: {account.slice(0, 6)}...{account.slice(-4)}</p>
        )}
      </header>

      <main>
        <section>
          <h2>Мои NFT</h2>
          <div className="nft-grid">
            {myNFTs.map((nft) => (
              <NFTCard
                key={nft.tokenId}
                nft={nft}
                onList={(price) => listNFT(nft.tokenId, price)}
                isOwner={true}
              />
            ))}
          </div>
        </section>

        <section>
          <h2>Маркетплейс</h2>
          <div className="nft-grid">
            {listings.map((listing) => (
              <ListingCard
                key={listing.tokenId}
                listing={listing}
                onBuy={() => buyNFT(listing.tokenId, listing.price)}
                currentAccount={account}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// Компонент карточки NFT
function NFTCard({ nft, onList, isOwner }) {
  const [showListForm, setShowListForm] = useState(false);
  const [price, setPrice] = useState('');

  const handleList = () => {
    if (price && price > 0) {
      onList(price);
      setShowListForm(false);
      setPrice('');
    }
  };

  return (
    <div className="nft-card">
      <img src={nft.tokenURI} alt={`NFT #${nft.tokenId}`} />
      <h3>NFT #{nft.tokenId}</h3>
      
      {isOwner && !showListForm && (
        <button onClick={() => setShowListForm(true)}>
          Выставить на продажу
        </button>
      )}
      
      {showListForm && (
        <div className="list-form">
          <input
            type="number"
            placeholder="Цена в ETH"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button onClick={handleList}>Подтвердить</button>
          <button onClick={() => setShowListForm(false)}>Отмена</button>
        </div>
      )}
    </div>
  );
}

// Компонент карточки листинга
function ListingCard({ listing, onBuy, currentAccount }) {
  const priceInEth = ethers.utils.formatEther(listing.price);
  const isOwner = listing.seller.toLowerCase() === currentAccount.toLowerCase();

  return (
    <div className="listing-card">
      <img src={listing.tokenURI} alt={`NFT #${listing.tokenId}`} />
      <h3>NFT #{listing.tokenId}</h3>
      <p>Цена: {priceInEth} ETH</p>
      <p>Продавец: {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}</p>
      
      {!isOwner && (
        <button onClick={onBuy}>Купить</button>
      )}
    </div>
  );
}

export default App;
