console.log('Goodblock content script.');

/******************************************************************************/
/******************************************************************************/

// Our React app code.

var GoodblockRootElem = React.createClass({
	getInitialState: function() {
		return {
			isClicked: false,
		}
	},
	onClick: function() {
		this.setState({'isClicked': !this.state.isClicked});
	},
	render: function() {
		var id = 'goodblockBaseElem';
		var content = 'Goodblock!';
		var textColor = '#000';
		var backgroundColor = '#E2E2E2';
		if (this.state.isClicked) {
			content = 'Goodblock clicked!';
			textColor = '#FFF';
			backgroundColor = '#000';
		}
		var style = {
			position: 'fixed',
			bottom: '10px',
			left: '10px',
			width: '100px',
			height: '100px',
			display: 'block',
			zIndex: '10000000',
			color: textColor,
			backgroundColor: backgroundColor,
			padding: '10px',
		};
		return (
			<div
				id={id}
				style={style}
				onMouseDown={this.onClick}
				dataGoodblockElem='true'>
					{content}
			</div>
		);
	}
});


/******************************************************************************/
/******************************************************************************/

// TODO: Move Goodblock data fetching here instead of in
// contentscript-start.js. No need for it to live elsewhere.
console.log('goodblockData', vAPI.goodblockData);

// TODO: Listen for Goodblock data changes from the extension
// and pass them into our React code for stateful updating.

var reactBaseElem = document.createElement('div');
var reactBaseElemId = 'react-base';
reactBaseElem.id = reactBaseElemId;
document.body.appendChild(reactBaseElem);
// TODO: pass Goodblock data as a property.
React.render(<GoodblockRootElem />, document.getElementById(reactBaseElemId));

/******************************************************************************/
/******************************************************************************/
